import { and, eq, isNull } from 'drizzle-orm'
import pino from 'pino'
import { db } from '../db'
import { users, veActionConfigs, veTxns } from '../db/schema'
import { findUserById } from '../lib/dbUtils' // Assuming this utility exists

const logger = pino({
  name: 'veService',
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty' }
      : undefined,
})

const DEFAULT_GENERATION_COST = 10

export interface VEDeductionResult {
  success: boolean
  newVE?: number
  message?: string
  statusCode?: number
  currentVE?: number // For cases like insufficient VE
  requiredVE?: number // For cases like insufficient VE
}

/**
 * Retrieves the Vibe Energy cost for a specific action, optionally based on a modelId.
 * @param actionType The type of action (e.g., "generate", "daily_check_in").
 * @param modelId Optional model identifier if the cost is model-specific.
 * @returns The VE cost for the action. Returns -1 if config not found to distinguish from 0 cost.
 */
export const getVeActionCost = async (
  actionType: string,
  modelId?: string,
): Promise<number> => {
  try {
    const query = db
      .select({ cost: veActionConfigs.cost })
      .from(veActionConfigs)
      .where(
        modelId
          ? and(
              eq(veActionConfigs.actionType, actionType),
              eq(veActionConfigs.modelId, modelId),
            )
          : and(
              eq(veActionConfigs.actionType, actionType),
              isNull(veActionConfigs.modelId),
            ),
      )
      .limit(1)

    const config = await query

    if (config.length > 0 && typeof config[0].cost === 'number') {
      return config[0].cost
    }

    // If no specific config, apply default logic and potentially seed for 'generate' action
    if (actionType === 'generate') {
      if (modelId) {
        // Specific model for generation, but no config found - seed it.
        logger.warn(
          { actionType, modelId },
          `VE cost configuration not found for 'generate' action with model ${modelId}. Seeding with default cost: ${DEFAULT_GENERATION_COST}`,
        )
        try {
          await db
            .insert(veActionConfigs)
            .values({
              actionType,
              modelId,
              cost: DEFAULT_GENERATION_COST,
              // createdAt and updatedAt will use defaultNow()
            })
            .onConflictDoNothing() // In case of a race condition where another request just inserted it.
          return DEFAULT_GENERATION_COST
        } catch (seedError) {
          logger.error(
            { error: seedError, actionType, modelId },
            `Failed to seed VE cost configuration for model ${modelId}. Returning default cost anyway.`,
          )
          return DEFAULT_GENERATION_COST // Fallback to default cost even if seeding fails
        }
      } else {
        // Generic 'generate' action without a specific modelId - just return default, don't seed generic null modelId dynamically here.
        logger.warn(
          { actionType },
          `VE cost configuration not found for generic 'generate' action. Applying default cost: ${DEFAULT_GENERATION_COST}`,
        )
        return DEFAULT_GENERATION_COST
      }
    }

    // For actions other than 'generate' or if something went wrong with generate logic above
    logger.warn(
      { actionType, modelId },
      'VE cost configuration not found and no default defined or applicable for this action type. Returning -1.',
    )
    return -1 // Indicate config not found and no default applicable
  } catch (error) {
    logger.error(
      { error, actionType, modelId },
      'Error fetching/seeding VE action cost',
    )
    // If a critical error occurs during DB fetch/seed, decide fallback.
    // For generation, falling back to default cost might be acceptable.
    if (actionType === 'generate') {
      logger.error(
        { error, actionType, modelId },
        `Critical error during VE cost processing for 'generate'. Falling back to default cost: ${DEFAULT_GENERATION_COST}`,
      )
      return DEFAULT_GENERATION_COST
    }
    return -1 // For other actions, -1 indicates a problem.
  }
}

interface DeductVeResult {
  success: boolean
  message: string
  statusCode: number
  currentVE?: number // User's VE before deduction attempt
  requiredVE?: number // Cost of the action
  newVE?: number // User's VE after successful deduction
}

/**
 * Deducts Vibe Energy from a user for a specific action.
 * @param userId The ID of the user.
 * @param actionType The type of action (e.g., "generate").
 * @param modelId Optional model identifier for model-specific costs.
 * @param refId Optional reference ID (e.g., jamId, postId) for the transaction.
 * @returns An object indicating success or failure, along with relevant VE details.
 */
export const deductVibeEnergy = async (
  userId: string,
  actionType: string,
  modelId?: string,
  refId?: string,
): Promise<DeductVeResult> => {
  const user = await findUserById(userId) // Assumes findUserById fetches { id, vibe_energy }
  if (!user || typeof user.vibe_energy !== 'number') {
    logger.error({ userId }, 'User not found or vibe_energy is not a number.')
    return {
      success: false,
      message: 'User not found or VE balance is invalid.',
      statusCode: 404,
    }
  }

  const requiredVE = await getVeActionCost(actionType, modelId)

  if (requiredVE < 0) {
    logger.error(
      { userId, actionType, modelId, requiredVE },
      'VE cost configuration error (returned -1 or other error). Cannot deduct VE.',
    )
    return {
      success: false,
      message: 'Vibe Energy cost configuration error for this action/model.',
      statusCode: 500,
      currentVE: user.vibe_energy,
      requiredVE: undefined,
    }
  }

  if (requiredVE === 0) {
    logger.info(
      { userId, actionType, modelId },
      'Action has zero VE cost. No deduction needed.',
    )
    // Optionally, still record a zero-cost transaction if that's useful for auditing
    // For now, we treat it as success without DB changes for VE.
    return {
      success: true,
      message: 'Action has no Vibe Energy cost.',
      statusCode: 200,
      currentVE: user.vibe_energy,
      requiredVE: 0,
      newVE: user.vibe_energy,
    }
  }

  if (user.vibe_energy < requiredVE) {
    logger.warn(
      { userId, currentVE: user.vibe_energy, requiredVE, actionType, modelId },
      'Insufficient Vibe Energy.',
    )
    return {
      success: false,
      message: 'Insufficient Vibe Energy.',
      statusCode: 402, // Payment Required
      currentVE: user.vibe_energy,
      requiredVE,
    }
  }

  const newVeBalance = user.vibe_energy - requiredVE

  try {
    let reasonString = `Action: ${actionType}`
    if (modelId) {
      reasonString += `, Model: ${modelId}`
    }

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ vibe_energy: newVeBalance, updatedAt: new Date() }) // Changed to vibe_energy
        .where(eq(users.id, userId))

      await tx.insert(veTxns).values({
        userId,
        delta: -requiredVE, // Negative for deduction
        reason: reasonString, // Use the constructed reason string
        refId,
      })
    })

    logger.info(
      {
        userId,
        actionType,
        modelId,
        deductedAmount: requiredVE,
        newVeBalance,
      },
      'Vibe Energy deducted successfully.',
    )
    return {
      success: true,
      message: 'Vibe Energy deducted successfully.',
      statusCode: 200,
      currentVE: user.vibe_energy,
      requiredVE,
      newVE: newVeBalance,
    }
  } catch (error) {
    logger.error(
      {
        error, // Standard way to log error objects
        userId,
        actionType,
        modelId,
        requiredVE,
        operation: 'deductVibeEnergy', // Add context to the log
      },
      'Error deducting Vibe Energy or recording transaction.',
    )
    // This is a critical error. VE might not have been deducted or txn not recorded.
    // Decide on rollback strategy or compensating transaction if only one part failed.
    // For now, assume transaction handles atomicity.
    return {
      success: false,
      message: 'Failed to deduct Vibe Energy due to a database error.',
      statusCode: 500,
      currentVE: user.vibe_energy,
      requiredVE,
    }
  }
}

export class VeCostDeterminationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VeCostDeterminationError'
  }
}
