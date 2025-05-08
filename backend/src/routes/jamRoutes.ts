import { zValidator } from '@hono/zod-validator'
import { type Context, Hono, type TypedResponse } from 'hono'
import { pino } from 'pino' // Assuming pino is used for logging, adjust if global logger is preferred
import { z } from 'zod'

import crypto from 'node:crypto' // For generating taskId
import { sql } from 'drizzle-orm'
import { REQUIRED_VE_FOR_GENERATION } from '../config/constants' // Import the constant
import { GEN_TASK_QUEUE_NAME, type GenTaskPayload } from '../config/queues'
import { db } from '../db'
import { jams, messages as messagesTable } from '../db/schema' // usersTable for VE check, messagesTable
import { verifyUserJamOwnership } from '../lib/dbUtils' // Import new helper
import jobQueue from '../lib/jobQueue' // pg-boss instance
import {
  type AuthenticatedContextEnv,
  requireAuthMiddleware,
} from '../middleware/auth'
import { deductVibeEnergy } from '../services/veService' // Import new VE service
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

// Define a type for valid HTTP status codes used in this module
// These are typically ContentfulStatusCodes in Hono context.
type ValidHttpStatusCodes =
  | 200
  | 201
  | 202
  | 400
  | 401
  | 402
  | 403
  | 404
  | 422
  | 500
  | 503

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
        },
        500 as ValidHttpStatusCodes,
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
          500 as ValidHttpStatusCodes,
        )
      }
      pinoLogger.info(
        { userId: user.id, jamId: newJam[0].id },
        'New jam created',
      )
      return c.json({ jamId: newJam[0].id }, 201 as ValidHttpStatusCodes)
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
        500 as ValidHttpStatusCodes,
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
        500 as ValidHttpStatusCodes,
      )
    }

    const jamIdString = c.req.param('jamId')
    const jamId = Number.parseInt(jamIdString, 10)

    if (Number.isNaN(jamId)) {
      return c.json(
        { code: 400, message: 'Invalid Jam ID format.' },
        400 as ValidHttpStatusCodes,
      )
    }

    const validatedBody = c.req.valid('json' as never) as z.infer<
      typeof generateImageRequestBodySchema
    >

    try {
      // Verify jam ownership (optional, depends on if generation should be tied to owning the jam)
      // For now, we assume a user can generate for any jamId they have, linking via prompt.
      // If strict ownership is needed:
      // const ownership = await verifyUserJamOwnership(user.id, jamId);
      // if (!ownership.jamExists) {
      //   return c.json({ code: 404, message: 'Jam session not found.' }, 404);
      // }
      // if (!ownership.isOwner) {
      //   logger.warn({ userId: user.id, jamId }, "User tried to generate for a jam they don't own.");
      //   return c.json({ code: 403, message: 'Forbidden.' }, 403);
      // }

      // Step 1 & 2: Check and Deduct Vibe Energy using veService
      const veResult = await deductVibeEnergy(
        user.id,
        REQUIRED_VE_FOR_GENERATION,
        'generate',
        jamId, // Using jamId as refId for VE txn for now
      )

      if (!veResult.success) {
        pinoLogger.warn(
          {
            userId: user.id,
            currentVE: veResult.currentVE,
            requiredVE: veResult.requiredVE,
            message: veResult.message,
          },
          'Vibe Energy deduction failed.',
        )
        return c.json(
          {
            code: (veResult.statusCode || 400) as number, // Keep original body code as number
            message: veResult.message || 'Failed to process Vibe Energy.',
            ...(veResult.currentVE !== undefined && {
              currentVE: veResult.currentVE,
            }),
            ...(veResult.requiredVE !== undefined && {
              requiredVE: veResult.requiredVE,
            }),
          } as GenerateImageResponse,
          (veResult.statusCode || 400) as ValidHttpStatusCodes,
        )
      }

      pinoLogger.info(
        { userId: user.id, newVE: veResult.newVE },
        'Vibe Energy processed successfully for image generation.',
      )

      // Step 2c: Store user's prompt message
      try {
        await db.insert(messagesTable).values({
          jamId: jamId, // Use parsed jamId
          role: 'user',
          text: validatedBody.prompt,
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
          503 as ValidHttpStatusCodes,
        )
      }

      const taskId = crypto.randomUUID()
      const jobPayload: GenTaskPayload = {
        taskId,
        jamId: jamId.toString(), // Convert number jamId to string for payload
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
      return c.json({ taskId: taskId }, 202 as ValidHttpStatusCodes) // 202 Accepted
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
        500 as ValidHttpStatusCodes,
      )
    }
  },
)

// Get messages for a specific Jam
jamApp.get(
  '/:jamId/messages',
  requireAuthMiddleware,
  async (c: Context<AuthenticatedContextEnv>) => {
    const user = c.get('user')
    if (!user || !user.id) {
      pinoLogger.error(
        { path: c.req.path },
        'User object or user.id missing from context after requireAuthMiddleware.',
      )
      return c.json(
        {
          code: 500, // Or 401, but middleware should have caught it.
          message: 'Internal server error: User authentication data missing.',
        },
        500 as ValidHttpStatusCodes,
      )
    }

    const jamId = Number.parseInt(c.req.param('jamId'), 10)

    if (Number.isNaN(jamId)) {
      return c.json(
        { code: 400, message: 'Invalid Jam ID format' },
        400 as ValidHttpStatusCodes,
      )
    }

    try {
      const { jamExists, isOwner, jam } = await verifyUserJamOwnership(
        user.id,
        jamId,
      )

      if (!jamExists) {
        return c.json(
          { code: 404, message: 'Jam session not found' },
          404 as ValidHttpStatusCodes,
        )
      }

      if (!isOwner) {
        pinoLogger.warn(
          {
            requestedJamId: jamId,
            actualUserId: user.id,
            ownerUserId: jam?.userId, // jam will exist if jamExists is true
          },
          'User attempted to access messages for a jam they do not own.',
        )
        return c.json(
          { code: 404, message: 'Jam session not found' },
          404 as ValidHttpStatusCodes,
        ) // Keep 404 for privacy
      }

      // 2. Fetch messages for the jam, ordered by creation time
      const messages = await db
        .select()
        .from(messagesTable)
        .where(sql`${messagesTable.jamId} = ${jamId}`)
        .orderBy(sql`${messagesTable.createdAt} ASC`)

      pinoLogger.info(
        { userId: user.id, jamId, messageCount: messages.length },
        `Fetched messages for jam ${jamId}`,
      )
      return c.json(messages, 200 as ValidHttpStatusCodes)
    } catch (error) {
      pinoLogger.error(
        { err: error, userId: user.id, jamId },
        'Error fetching messages for jam',
      )
      return c.json(
        { code: 500, message: 'Internal server error fetching messages' },
        500 as ValidHttpStatusCodes,
      )
    }
  },
)

export default jamApp
