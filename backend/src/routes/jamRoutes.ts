import { zValidator } from '@hono/zod-validator'
import { type Context, Hono, type TypedResponse } from 'hono'
import { pino } from 'pino' // Assuming pino is used for logging, adjust if global logger is preferred
import { z } from 'zod'

import crypto from 'node:crypto' // For generating taskId
import { eq, sql } from 'drizzle-orm'
import { REQUIRED_VE_FOR_GENERATION } from '../config/constants' // Import the constant
import { GEN_TASK_QUEUE_NAME, type GenTaskPayload } from '../config/queues'
import { db } from '../db'
import {
  jams,
  messages as messagesTable,
  users as usersTable,
  veTxns,
} from '../db/schema' // usersTable for VE check, messagesTable
import jobQueue from '../lib/jobQueue' // pg-boss instance
import {
  type AuthenticatedContextEnv,
  requireAuthMiddleware,
} from '../middleware/auth'
// Import other necessary things like pg-boss types/instance if needed for generate route later

// Define AppEnv specifically for jamRoutes, extending AuthenticatedContextEnv
const generateImageRequestBodySchema = z.object({
  prompt: z
    .string()
    .min(1, { message: 'Prompt cannot be empty.' })
    .max(4000, { message: 'Prompt too long.' }),
  modelProvider: z.enum(['openai', 'google'], {
    errorMap: () => ({ message: 'Invalid model provider.' }),
  }),
  modelId: z.string().min(1, { message: 'Model ID cannot be empty.' }),
  size: z.string().regex(/^\d+x\d+$/, {
    message: 'Invalid size format, expected e.g., 1024x1024.',
  }),
})

interface JamRoutesAppEnv extends AuthenticatedContextEnv {
  ValidatedData: {
    json: z.infer<typeof generateImageRequestBodySchema>
  }
}

// Define a union type for possible JSON responses from the generate endpoint
type GenerateImageResponse =
  | { taskId: string }
  | { code: number; message: string; currentVE?: number; requiredVE?: number }
  | { code: number; message: string } // Generic error

const jamApp = new Hono<JamRoutesAppEnv>()

// Re-initialize pinoLogger for this route module or import a shared one
const pinoLogger = pino({
  name: 'jam-routes',
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty' }
      : undefined,
})

// Create a new Jam session (maps to POST / if registered under /api/jams)
jamApp.post(
  '/',
  requireAuthMiddleware,
  async (c: Context<AuthenticatedContextEnv>) => {
    const user = c.get('user')
    if (!user || !user.id) {
      pinoLogger.error(
        { path: c.req.path },
        'User object or user.id missing after requireAuthMiddleware.',
      )
      return c.json(
        {
          code: 500,
          message: 'Internal server error: User authentication data missing.',
        } as GenerateImageResponse,
        500,
      )
    }

    try {
      const newJam = await db
        .insert(jams)
        .values({ userId: user.id })
        .returning({ id: jams.id })

      if (!newJam || newJam.length === 0 || !newJam[0].id) {
        pinoLogger.error(
          { userId: user.id },
          'Failed to create new jam or retrieve its ID.',
        )
        return c.json(
          {
            code: 500,
            message: 'Failed to create jam session',
          } as GenerateImageResponse,
          500,
        )
      }
      pinoLogger.info(
        { userId: user.id, jamId: newJam[0].id },
        'New jam created',
      )
      return c.json({ jamId: newJam[0].id }, 201)
    } catch (error) {
      pinoLogger.error(
        { err: error, userId: user.id },
        'Error creating new jam session',
      )
      return c.json(
        {
          code: 500,
          message: 'Internal server error while creating jam',
        } as GenerateImageResponse,
        500,
      )
    }
  },
)

// Generate image(s) for a Jam (maps to POST /:jamId/generate)
jamApp.post(
  '/:jamId/generate',
  requireAuthMiddleware,
  zValidator('json', generateImageRequestBodySchema),
  async (
    c: Context<JamRoutesAppEnv>,
  ): Promise<TypedResponse<GenerateImageResponse>> => {
    const user = c.get('user')
    if (!user || !user.id) {
      pinoLogger.error(
        { path: c.req.path },
        'User object or user.id missing after requireAuthMiddleware.',
      )
      return c.json(
        {
          code: 500,
          message: 'Internal server error: User authentication data missing.',
        },
        500,
      )
    }

    const jamId = c.req.param('jamId')
    const validatedBody = c.req.valid('json' as never) as z.infer<
      typeof generateImageRequestBodySchema
    >
    // const REQUIRED_VE_FOR_GENERATION = 6 // Use imported constant

    let userHadSufficientVE = false // Flag to ensure VE deduction was attempted and potentially succeeded

    try {
      const userRecord = await db
        .select({ vibeEnergy: usersTable.vibe_energy })
        .from(usersTable)
        .where(eq(usersTable.id, user.id))
        .limit(1)

      if (!userRecord || userRecord.length === 0) {
        pinoLogger.error(
          { userId: user.id },
          'User not found in database for VE check',
        )
        return c.json({ code: 404, message: 'User not found' }, 404)
      }

      const currentVE = userRecord[0].vibeEnergy
      if (currentVE < REQUIRED_VE_FOR_GENERATION) {
        pinoLogger.warn(
          {
            userId: user.id,
            currentVE,
            requiredVE: REQUIRED_VE_FOR_GENERATION,
          },
          'Insufficient VE',
        )
        return c.json(
          {
            code: 402,
            message: 'Insufficient Vibe Energy.',
            currentVE,
            requiredVE: REQUIRED_VE_FOR_GENERATION,
          },
          402,
        )
      }
      pinoLogger.info({ userId: user.id, currentVE }, 'Sufficient VE.')

      // Step 2: Atomically deduct VE
      const updateResult = await db
        .update(usersTable)
        .set({
          vibe_energy: sql`${usersTable.vibe_energy} - ${REQUIRED_VE_FOR_GENERATION}`,
        })
        .where(eq(usersTable.id, user.id))
        .returning({ vibeEnergy: usersTable.vibe_energy })

      if (
        !updateResult ||
        updateResult.length === 0 ||
        updateResult[0].vibeEnergy === undefined
      ) {
        pinoLogger.error(
          { userId: user.id },
          'Failed to deduct VE from user account.',
        )
        return c.json(
          { code: 500, message: 'Error processing Vibe Energy update.' },
          500,
        )
      }

      pinoLogger.info(
        { userId: user.id, newVE: updateResult[0].vibeEnergy },
        'Vibe Energy deducted successfully.',
      )
      userHadSufficientVE = true // Mark that VE processing reached this point

      // Step 2b: Record VE transaction in veTxns table
      await db.insert(veTxns).values({
        userId: user.id,
        delta: -REQUIRED_VE_FOR_GENERATION, // Negative value for deduction
        reason: 'generate',
        refId: Number.parseInt(jamId, 10), // Assuming jamId is a number after parsing. Or could be taskId.
        // db_schema.md shows veTxns.ref_id as BIGINT.
        // If jamId is not suitable, we might need the upcoming taskId.
        // For now, using jamId if it's numeric. Ensure it fits BIGINT.
      })

      pinoLogger.info(
        {
          userId: user.id,
          change: -REQUIRED_VE_FOR_GENERATION,
          reason: 'generate',
          ref: jamId,
        },
        'VE transaction recorded',
      )

      // Step 2c: Store user's prompt message
      try {
        await db.insert(messagesTable).values({
          jamId: Number.parseInt(jamId, 10),
          role: 'user',
          text: validatedBody.prompt,
          // images will be null/undefined for user text messages
        })
        pinoLogger.info(
          { userId: user.id, jamId, prompt: validatedBody.prompt },
          'User prompt message stored',
        )
      } catch (msgError) {
        pinoLogger.error(
          { err: msgError, userId: user.id, jamId },
          'Failed to store user prompt message. Proceeding with generation.',
        )
        // Not returning an error to the client for this, as generation can still proceed.
        // However, this indicates a data consistency issue that should be monitored.
      }

      // Step 3: Publish task to pg-boss
      if (!jobQueue) {
        pinoLogger.error(
          'Job queue (pg-boss) is not initialized. Cannot publish generate task.',
        )
        // Potentially refund VE here or mark for refund if this is critical path
        return c.json(
          {
            code: 503,
            message: 'Image generation service temporarily unavailable.',
          },
          503,
        )
      }

      const taskId = crypto.randomUUID()
      const jobPayload: GenTaskPayload = {
        taskId,
        jamId: jamId, // jamId from path param (string)
        prompt: validatedBody.prompt,
        model: validatedBody.modelId, // Renaming to model as per GenTaskPayload
        size: validatedBody.size,
        userId: user.id,
        // modelProvider: validatedBody.modelProvider, // If GenTaskPayload needs it
      }

      await jobQueue.publish(GEN_TASK_QUEUE_NAME, jobPayload)
      pinoLogger.info(
        { userId: user.id, jamId, taskId, jobName: GEN_TASK_QUEUE_NAME },
        'Image generation task published to queue',
      )

      // Step 4: Return taskId
      return c.json({ taskId: taskId }, 202) // 202 Accepted
    } catch (error) {
      pinoLogger.error(
        { err: error, userId: user?.id },
        'Error during image generation process',
      )
      // If VE was deducted but job publishing failed, we might need to refund VE.
      // This requires more complex transaction/rollback logic or a compensating transaction.
      // For now, just logging the error.
      // if (userHadSufficientVE && user && user.id) { /* TODO: Add VE refund logic here if error after deduction */ }
      return c.json(
        { code: 500, message: 'Internal server error during image generation' },
        500,
      )
    }
  },
)

export default jamApp
