import { zValidator } from '@hono/zod-validator'
import { type Context, Hono, type TypedResponse } from 'hono'
import { pino } from 'pino' // Assuming pino is used for logging, adjust if global logger is preferred
import { z } from 'zod'

import { sql } from 'drizzle-orm'
import { REQUIRED_VE_FOR_GENERATION } from '../config/constants' // Import the constant
import { db } from '../db'
import { jams, messages as messagesTable } from '../db/schema' // usersTable for VE check, messagesTable
import { verifyUserJamOwnership } from '../lib/dbUtils' // Import new helper
import {
  type AuthenticatedContextEnv,
  requireAuthMiddleware,
} from '../middleware/auth'
import { imageGenerationService } from '../services/imageGenerationService' // Cleaned up import
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

// Type for an image object stored in the messages.images JSONB column
interface MessageImageData {
  id: string // A unique ID for this image instance, e.g., timestamp or UUID
  url: string // URL or Base64 Data URI
  altText?: string
  // Potentially other metadata: width, height, modelUsed etc.
}

// Updated response type for the frontend.
interface SuccessfulGenerationClientResponse {
  id: number // ID of the newly created assistant message
  jamId: number
  role: 'ai' // Consistent with schema
  text: string | null // text can be null
  images: MessageImageData[] | null // Array of image data objects, can be null
  createdAt: string // ISO string
  // For simplicity, we can also provide top-level fields for the first image if frontend expects it:
  imageUrl?: string // primary image URL
  altText?: string // primary image alt text
}

type GenerateImageClientResponse =
  | SuccessfulGenerationClientResponse
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
          } as GenerateImageClientResponse,
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
        } as GenerateImageClientResponse,
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
  ): Promise<TypedResponse<GenerateImageClientResponse>> => {
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
      const ownership = await verifyUserJamOwnership(user.id, jamId)
      if (!ownership.jamExists) {
        return c.json({ code: 404, message: 'Jam session not found.' }, 404)
      }
      if (!ownership.isOwner) {
        pinoLogger.warn(
          { userId: user.id, jamId },
          "User tried to generate for a jam they don't own.",
        )
        return c.json({ code: 403, message: 'Forbidden.' }, 403)
      }

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
          } as GenerateImageClientResponse,
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

      const serviceParams = {
        prompt: validatedBody.prompt,
        modelId: validatedBody.modelId,
        modelProvider: validatedBody.modelProvider,
        size: validatedBody.size,
        n: 1, // Generate 1 image for now
      }
      const serviceResponse =
        await imageGenerationService.generateImageDirectly(serviceParams)

      if (
        !serviceResponse ||
        !serviceResponse.images ||
        serviceResponse.images.length === 0
      ) {
        pinoLogger.error(
          { userId: user.id, jamId, params: serviceParams },
          'Service returned no images.',
        )
        return c.json(
          { code: 500, message: 'Image generation failed: No image data.' },
          500 as ValidHttpStatusCodes,
        )
      }

      const firstImage = serviceResponse.images[0]
      const imageUrlToStore =
        firstImage.url || `data:image/png;base64,${firstImage.base64}`
      const imageAltText = `Generated image for: "${validatedBody.prompt.substring(0, 100)}${validatedBody.prompt.length > 100 ? '...' : ''}"`

      const newImageData: MessageImageData = {
        id: Date.now().toString(), // Simple unique ID for the image object
        url: imageUrlToStore,
        altText: imageAltText,
      }

      const assistantMessageText = "Here's the image you requested:"
      const insertedAssistantMessages = await db
        .insert(messagesTable)
        .values({
          jamId: jamId,
          role: 'ai', // Use 'ai' as per schema
          text: assistantMessageText,
          images: [newImageData], // Store as an array in the JSONB column
        })
        .returning()

      if (
        !insertedAssistantMessages ||
        insertedAssistantMessages.length === 0
      ) {
        pinoLogger.error(
          { userId: user.id, jamId },
          'Failed to store assistant message.',
        )
        return c.json(
          { code: 500, message: 'Failed to save generated image message.' },
          500 as ValidHttpStatusCodes,
        )
      }

      const newAssistantMessage = insertedAssistantMessages[0]

      pinoLogger.info(
        { userId: user.id, jamId, messageId: newAssistantMessage.id },
        'Assistant message stored.',
      )

      // Ensure createdAt and jamId are not null for the response
      const createdAt = newAssistantMessage.createdAt
        ? newAssistantMessage.createdAt.toISOString()
        : new Date().toISOString()
      const responseJamId =
        newAssistantMessage.jamId !== null ? newAssistantMessage.jamId : jamId // Fallback, though jamId on message should be set

      const clientResponse: SuccessfulGenerationClientResponse = {
        id: newAssistantMessage.id,
        jamId: responseJamId,
        role: newAssistantMessage.role as 'ai', // Role will be 'ai'
        text: newAssistantMessage.text,
        images: newAssistantMessage.images as MessageImageData[] | null, // Cast if necessary, or parse
        createdAt: createdAt,
        // Provide top-level fields for the first image for easier frontend consumption initially
        imageUrl:
          newAssistantMessage.images &&
          Array.isArray(newAssistantMessage.images) &&
          newAssistantMessage.images.length > 0
            ? (newAssistantMessage.images[0] as MessageImageData).url
            : undefined,
        altText:
          newAssistantMessage.images &&
          Array.isArray(newAssistantMessage.images) &&
          newAssistantMessage.images.length > 0
            ? (newAssistantMessage.images[0] as MessageImageData).altText
            : undefined,
      }

      return c.json(clientResponse, 200 as ValidHttpStatusCodes)
    } catch (error: unknown) {
      pinoLogger.error(
        { err: error, userId: user?.id, jamId },
        'Unhandled error in generation route.',
      )
      let message = 'An unexpected error occurred.'
      if (error instanceof Error) message = error.message
      return c.json(
        { code: 500, message } as GenerateImageClientResponse,
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
