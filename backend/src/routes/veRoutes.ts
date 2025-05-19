import { zValidator } from '@hono/zod-validator'
import { eq } from 'drizzle-orm'
import { type Context, Hono } from 'hono'
import pino from 'pino'
import { z } from 'zod'
import {
  DAILY_VE_BONUS_BASE,
  MAX_MONTHLY_CHECK_INS,
  MAX_STREAK_BONUS,
  STREAK_INTERVAL,
} from '../config/constants'
import { db } from '../db'
import { users } from '../db/auth-schema'
import { veTxns } from '../db/schema'
import type { AuthenticatedContextEnv } from '../middleware/auth' // Assuming you might want auth later
import { requireAuthMiddleware } from '../middleware/auth'
import {
  VeCostDeterminationError,
  getVeActionCost,
} from '../services/veService'

const logger = pino({
  name: 'veRoutes',
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty' }
      : undefined,
})

// Define an environment for this app that includes the validated query type
interface VeAppEnv extends AuthenticatedContextEnv {
  ValidatedData: {
    query: z.infer<typeof veCostQuerySchema>
  }
}

const veApp = new Hono<{ Variables: AuthenticatedContextEnv['Variables'] }>()

const veCostQuerySchema = z.object({
  actionType: z.string().min(1, { message: 'actionType is required' }),
  modelId: z.string().optional(),
})

// Zod schema for VE transaction reasons
const VeTransactionReasonEnum = z.enum([
  'signup_bonus',
  'daily_check_in',
  'image_generation_cost',
  'image_generation_refund',
  'post_publish_bonus',
  'post_remixed_bonus',
])

veApp.get(
  '/cost',
  zValidator('query', veCostQuerySchema),
  async (c: Context<{ Variables: AuthenticatedContextEnv['Variables'] }>) => {
    // Assuming zValidator populates c.req.valid, we cast to bypass stricter TS checks
    // if the automatic type inference isn't working perfectly.
    const { actionType, modelId } = c.req.valid('query' as never) as z.infer<
      typeof veCostQuerySchema
    >

    try {
      const cost = await getVeActionCost(actionType, modelId)
      return c.json({ cost })
    } catch (error: unknown) {
      if (error instanceof VeCostDeterminationError) {
        logger.warn(
          { actionType, modelId, errMessage: error.message },
          'Failed to determine VE cost for client request.',
        )
        return c.json({ error: error.message }, 404) // Not found or config error
      }

      const errorMessage =
        error instanceof Error ? error.message : 'An unknown error occurred.'
      logger.error(
        { actionType, modelId, error: String(error) }, // Log the string representation of the error
        `Unexpected error fetching VE cost: ${errorMessage}`,
      )
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

// POST /api/ve/daily-check-in - Claim daily VE check-in bonus
veApp.post('/daily-check-in', requireAuthMiddleware, async (c) => {
  const userSession = c.get('user')
  if (!userSession || !userSession.id) {
    return c.json(
      {
        success: false,
        message: 'Authentication required.',
      },
      401,
    )
  }
  const userId = userSession.id

  try {
    const todayUTCStart = new Date()
    todayUTCStart.setUTCHours(0, 0, 0, 0)

    const currentUserState = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        vibe_energy: true,
        last_daily_bonus_claimed_at: true,
        check_in_streak: true,
        monthly_check_ins: true,
      },
    })

    if (!currentUserState) {
      return c.json(
        {
          success: false,
          message: 'User not found.',
        },
        404,
      )
    }

    let alreadyClaimedToday = false
    if (currentUserState.last_daily_bonus_claimed_at) {
      const lastClaimDate = new Date(
        currentUserState.last_daily_bonus_claimed_at,
      )
      if (lastClaimDate >= todayUTCStart) {
        alreadyClaimedToday = true
      }
    }

    if (alreadyClaimedToday) {
      return c.json({
        success: true,
        message: 'Daily bonus already claimed for today.',
        newVeBalance: currentUserState.vibe_energy,
        claimedToday: true,
        alreadyClaimed: true,
        checkInStreak: currentUserState.check_in_streak || 0,
        monthlyCheckIns: currentUserState.monthly_check_ins || 0,
        maxMonthlyCheckIns: MAX_MONTHLY_CHECK_INS,
      })
    }

    // Check if user has reached the monthly check-in limit
    const monthlyCheckIns = currentUserState.monthly_check_ins || 0

    if (monthlyCheckIns >= MAX_MONTHLY_CHECK_INS) {
      return c.json({
        success: false,
        message: `You have reached the maximum check-ins for this month (${MAX_MONTHLY_CHECK_INS}). VE will be available again next month.`,
        newVeBalance: currentUserState.vibe_energy,
        claimedToday: false,
        alreadyClaimed: false,
        checkInStreak: currentUserState.check_in_streak || 0,
        monthlyCheckIns: monthlyCheckIns,
        maxMonthlyCheckIns: MAX_MONTHLY_CHECK_INS,
        monthlyLimitReached: true,
      })
    }

    // Calculate streak
    let checkInStreak = currentUserState.check_in_streak || 0
    const yesterday = new Date(todayUTCStart)
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)

    // If last check-in was yesterday, increment streak, otherwise reset to 1
    if (currentUserState.last_daily_bonus_claimed_at) {
      const lastClaimDate = new Date(
        currentUserState.last_daily_bonus_claimed_at,
      )
      const lastClaimDay = new Date(
        lastClaimDate.getUTCFullYear(),
        lastClaimDate.getUTCMonth(),
        lastClaimDate.getUTCDate(),
      )

      if (lastClaimDay.getTime() === yesterday.getTime()) {
        // Consecutive day, increase streak
        checkInStreak += 1
      } else if (lastClaimDay.getTime() < yesterday.getTime()) {
        // Streak broken, reset to 1
        checkInStreak = 1
      }
    } else {
      // First time checking in
      checkInStreak = 1
    }

    // Award bonus - base amount plus streak bonus
    // Streak bonus: +1 VE for every X consecutive days, max +Y VE
    const streakBonus = Math.min(
      Math.floor(checkInStreak / STREAK_INTERVAL),
      MAX_STREAK_BONUS,
    )
    const dailyBonusAmount = DAILY_VE_BONUS_BASE + streakBonus

    const newVeBalance = (currentUserState.vibe_energy || 0) + dailyBonusAmount

    await db.transaction(async (tx) => {
      // Update user's VE, last claimed timestamp, streak count, and monthly check-in count
      await tx
        .update(users)
        .set({
          vibe_energy: newVeBalance,
          last_daily_bonus_claimed_at: new Date(),
          check_in_streak: checkInStreak,
          monthly_check_ins: monthlyCheckIns + 1,
        })
        .where(eq(users.id, userId))

      // Insert into veTxns table
      await tx.insert(veTxns).values({
        userId: userId,
        delta: dailyBonusAmount,
        reason: VeTransactionReasonEnum.Enum.daily_check_in,
        refId: null, // refId is null for daily bonus
      })
    })

    return c.json({
      success: true,
      message: `Daily bonus claimed successfully! +${dailyBonusAmount} VE${streakBonus > 0 ? ` (includes +${streakBonus} streak bonus)` : ''}`,
      newVeBalance: newVeBalance,
      claimedToday: true,
      alreadyClaimed: false,
      checkInStreak: checkInStreak,
      monthlyCheckIns: monthlyCheckIns + 1,
      maxMonthlyCheckIns: MAX_MONTHLY_CHECK_INS,
      streakBonus: streakBonus,
    })
  } catch (error) {
    logger.error(
      { userId, error: String(error) },
      `Unexpected error claiming daily bonus: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
    return c.json(
      {
        success: false,
        message: 'Failed to claim daily bonus. Please try again later.',
      },
      500,
    )
  }
})

export default veApp
