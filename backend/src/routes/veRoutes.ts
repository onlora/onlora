import { zValidator } from '@hono/zod-validator'
import { type Context, Hono } from 'hono'
import pino from 'pino'
import { z } from 'zod'
import type { AuthenticatedContextEnv } from '../middleware/auth' // Assuming you might want auth later
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

export default veApp
