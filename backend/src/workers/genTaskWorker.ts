import { sql } from 'drizzle-orm'
import type { Job as PgBossJob } from 'pg-boss'
import pino from 'pino'
import {
  REQUIRED_VE_FOR_GENERATION,
  VE_REFUND_REASON_GENERATION_FAILURE,
} from '../config/constants'
import type { GenTaskPayload } from '../config/queues'
import { GEN_TASK_QUEUE_NAME } from '../config/queues' // Import queue name
import { db } from '../db'
import {
  images as imagesTable,
  messages as messagesTable,
  users as usersTable,
  veTxns,
} from '../db/schema'
import {
  publishTaskCompletion,
  publishTaskError,
  publishTaskProgress,
} from '../index' // Path to where SSE helper functions are exported from index.ts
import {
  type GenerateImageOptions,
  type GeneratedImageData,
  generateImageWithDedicatedModel,
} from '../lib/ai' // Assuming this is the primary image generation helper
import jobQueue from '../lib/jobQueue' // Import the boss instance
import { uploadBufferToR2 } from '../lib/r2'

const workerLogger = pino({
  name: 'gen-task-worker',
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty' }
      : undefined,
})

/**
 * Helper function to refund Vibe Energy to a user.
 */
const refundVibeEnergy = async (
  userId: string,
  amount: number,
  reason: string,
  refId: string | number, // Can be taskId (string) or other numeric ref
  jobId?: string, // Optional pg-boss job ID for logging context
) => {
  if (amount <= 0) {
    workerLogger.warn(
      { userId, amount, reason, refId, jobId },
      'Attempted to refund zero or negative VE. Skipping.',
    )
    return
  }

  try {
    workerLogger.info(
      { userId, amount, reason, refId, jobId },
      `Attempting to refund ${amount} VE to user ${userId}.`,
    )

    // Atomically update user's vibe_energy
    const updateUserVEResult = await db
      .update(usersTable)
      .set({ vibe_energy: sql`${usersTable.vibe_energy} + ${amount}` })
      .where(sql`${usersTable.id} = ${userId}`)
      .returning({ id: usersTable.id, newVE: usersTable.vibe_energy })

    if (
      !updateUserVEResult ||
      updateUserVEResult.length === 0 ||
      updateUserVEResult[0].newVE === undefined
    ) {
      workerLogger.error(
        { userId, amount, reason, refId, jobId },
        'Failed to update user vibe_energy during refund.',
      )
      // This is a critical error, but we don't want to stop the worker job from completing/failing
      // based on the original error. Just log it.
      return // Don't proceed to create a veTxns record if user update failed
    }

    // Record VE transaction
    await db.insert(veTxns).values({
      userId,
      delta: amount, // Positive for refund
      reason,
      refId: typeof refId === 'string' ? undefined : refId, //taskId is not a number, veTxns.refId is bigint. Can adjust if taskId needs to be stored differently
      // Consider adding taskId to a different text field in veTxns if needed
    })

    workerLogger.info(
      {
        userId,
        amount,
        reason,
        refId,
        jobId,
        newVE: updateUserVEResult[0].newVE,
      },
      `Successfully refunded ${amount} VE to user ${userId}. New VE: ${updateUserVEResult[0].newVE}.`,
    )
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    workerLogger.error(
      {
        userId,
        amount,
        reason,
        refId,
        jobId,
        err: err.message,
        stack: err.stack,
      },
      'Error during VE refund process.',
    )
    // Log and continue, don't let refund error break the main flow.
  }
}

/**
 * Handles a job from the 'gen-task' queue to generate an image.
 */
export const handleGenerateImageTask = async (
  jobs: PgBossJob<GenTaskPayload>[], // Expect an array of jobs
) => {
  // Ensure jobQueue is available, otherwise worker cannot function correctly.
  if (!jobQueue) {
    workerLogger.error(
      'Job queue (pg-boss) is not initialized. Worker cannot process tasks or report status.',
    )
    // If we cannot report status, we should not attempt to process the job.
    // This job will likely be picked up again later if the queue starts successfully.
    return
  }

  // For now, assume we process one job at a time, even if an array is passed.
  // Future enhancements could iterate through the jobs array if pg-boss sends batches.
  if (!jobs || jobs.length === 0) {
    workerLogger.warn('handleGenerateImageTask called with no jobs.')
    // If there are no jobs, there's nothing to mark as failed with pg-boss directly for a specific job ID.
    // This situation should ideally not occur if pg-boss calls the worker correctly.
    return
  }
  const job = jobs[0] // Process the first job in the array

  const { id: jobId, data: payload } = job
  const { taskId, jamId, prompt, model, size, userId } = payload

  // It's possible that job.id (jobId) might be undefined if the job object structure is unexpected.
  // Adding a check here for robustness, though pg-boss jobs should always have an id.
  if (!jobId) {
    workerLogger.error(
      { jobData: job },
      'Job ID is missing from the job object. Cannot process or report status for this job.',
    )
    // No specific job to fail with boss instance if ID is missing.
    return
  }

  workerLogger.info(
    { jobId, taskId, userId, jamId, prompt, model, size },
    `Processing image generation task for taskId: ${taskId}`,
  )

  try {
    // Notify client that processing has started (optional)
    publishTaskProgress(taskId, {
      status: 'processing',
      message: 'Starting image generation...',
    })

    // Step 1: Call AI model to generate image(s)
    // The model ID from payload.model might need to be mapped to specific AI SDK model identifiers if different
    // e.g., payload.model could be 'dall-e-3' which maps to openai.image('dall-e-3')
    // Assuming payload.model is directly usable or mapped within generateImageWithDedicatedModel

    const aiOptions: GenerateImageOptions = {
      prompt,
      modelProvider: 'openai', // This might need to come from payload or be configurable
      modelId: model, // e.g., 'dall-e-3'
      size: size as `${number}x${number}`, // Cast size string to expected format
      numberOfImages: 1, // For now, generate 1 image. PRD mentions 4, so this might change.
      // Add other options like aspectRatio, seed if they are passed in payload
    }

    workerLogger.info({ taskId, aiOptions }, 'Calling AI for image generation.')
    const generationResult = await generateImageWithDedicatedModel(aiOptions)

    if (!generationResult || generationResult.images.length === 0) {
      workerLogger.error(
        { taskId, generationResult },
        'AI did not generate any images or returned null.',
      )
      publishTaskError(taskId, {
        message: 'Failed to generate image. No images returned from AI.',
      })
      await refundVibeEnergy(
        userId,
        REQUIRED_VE_FOR_GENERATION,
        VE_REFUND_REASON_GENERATION_FAILURE,
        taskId,
        jobId,
      )
      await jobQueue.fail(GEN_TASK_QUEUE_NAME, jobId, {
        message: 'No images generated by AI',
      })
      return
    }

    const generatedImage: GeneratedImageData = generationResult.images[0] // Taking the first image for now
    workerLogger.info(
      { taskId },
      `AI generated ${generationResult.images.length} image(s). Processing first one.`,
    )
    publishTaskProgress(taskId, {
      status: 'ai_complete',
      message: 'AI processing complete. Preparing image...',
    })

    // Step 2: Upload generated image(s) to R2
    let imageUrl: string | undefined = undefined
    let imageKey: string | undefined = undefined // To store the R2 key
    let imageBuffer: Buffer | undefined = undefined
    const mimeType = generatedImage.mimeType || 'image/png' // Default to png if mimeType is missing
    const fileExtension = mimeType.split('/')[1]?.toLowerCase() || 'png'
    // Generate a unique name for the image, incorporating taskId for traceability
    const desiredFileName = `img_${taskId}_${Date.now()}.${fileExtension}`

    if (generatedImage.base64Image) {
      imageBuffer = Buffer.from(generatedImage.base64Image, 'base64')
    } else if (generatedImage.uint8ArrayImage) {
      imageBuffer = Buffer.from(generatedImage.uint8ArrayImage)
    }

    if (imageBuffer) {
      workerLogger.info(
        { taskId, jamId, desiredFileName, mimeType },
        'Uploading image to R2...',
      )
      const r2Result = await uploadBufferToR2(
        imageBuffer,
        mimeType,
        desiredFileName,
        `jams/${jamId}/images`, // Store under a jam-specific path
      )

      if (r2Result && r2Result.publicUrl && r2Result.key) {
        imageUrl = r2Result.publicUrl
        imageKey = r2Result.key // Capture the key
        workerLogger.info(
          { taskId, imageUrl, imageKey },
          'Image uploaded to R2 successfully.',
        )
      } else {
        workerLogger.error(
          { taskId },
          'R2 upload failed or did not return URL/key.',
        )
        // Fallback to placeholder or error out, for now, let's log and it will hit the !imageUrl check
      }
    } else {
      workerLogger.error({ taskId }, 'No image buffer available for upload.')
    }

    if (!imageUrl) {
      workerLogger.error(
        { taskId },
        'Failed to upload image to R2 or get public URL.',
      )
      publishTaskError(taskId, { message: 'Failed to store generated image.' })
      await refundVibeEnergy(
        userId,
        REQUIRED_VE_FOR_GENERATION,
        VE_REFUND_REASON_GENERATION_FAILURE,
        taskId,
        jobId,
      )
      await jobQueue.fail(GEN_TASK_QUEUE_NAME, jobId, {
        message: 'Image upload to R2 failed',
      })
      return
    }
    publishTaskProgress(taskId, {
      status: 'storage_complete',
      message: 'Image stored. Finalizing...',
      tempUrl: imageUrl,
    })

    // Step 3: Store image metadata in `images` table
    const insertedDbImage = await db
      .insert(imagesTable)
      .values({
        jamId: Number.parseInt(jamId, 10), // Ensure jamId is a number if your schema expects it
        url: imageUrl,
        r2Key: imageKey, // Store the R2 key
        model: model, // Store the modelId used
        prompt: prompt, // Store the prompt used
        // isPublic might be based on user's jam/post settings later
      })
      .returning({
        id: imagesTable.id,
        url: imagesTable.url,
        r2Key: imagesTable.r2Key,
      })

    if (!insertedDbImage || insertedDbImage.length === 0) {
      workerLogger.error(
        { taskId, imageUrl },
        'Failed to save image metadata to database.',
      )
      publishTaskError(taskId, { message: 'Failed to save image details.' })
      await refundVibeEnergy(
        userId,
        REQUIRED_VE_FOR_GENERATION,
        VE_REFUND_REASON_GENERATION_FAILURE,
        taskId,
        jobId,
      )
      await jobQueue.fail(GEN_TASK_QUEUE_NAME, jobId, {
        message: 'Database save for image metadata failed',
      })
      return
    }

    workerLogger.info(
      {
        taskId,
        dbImageId: insertedDbImage[0].id,
        imageUrl,
        r2Key: insertedDbImage[0].r2Key,
      },
      'Image metadata saved to DB.',
    )

    // Step 3b: Store AI response message
    try {
      const aiMessageText = generatedImage.revisedPrompt
        ? `Here's the image for: "${generatedImage.revisedPrompt}"`
        : `Here's the image I generated for your prompt.`

      await db.insert(messagesTable).values({
        jamId: Number.parseInt(jamId, 10),
        role: 'ai',
        text: aiMessageText,
        images: [
          {
            id: insertedDbImage[0].id,
            url: insertedDbImage[0].url,
            r2Key: insertedDbImage[0].r2Key,
            // Add other relevant image details if needed by frontend directly in message
          },
        ],
      })
      workerLogger.info(
        { taskId, jamId, imageId: insertedDbImage[0].id },
        'AI response message with image stored',
      )
    } catch (msgError) {
      workerLogger.error(
        { err: msgError, taskId, jamId, imageId: insertedDbImage[0].id },
        'Failed to store AI response message. Generation task considered complete.',
      )
      // Not failing the job for this, as the image is generated and stored.
      // This is a data consistency issue for the chat log.
    }

    // Step 4: Send final completion update via SSE
    publishTaskCompletion(taskId, {
      message: 'Image generated successfully!',
      imageUrl: insertedDbImage[0].url, // Use URL from DB
      imageId: insertedDbImage[0].id,
      // ... other relevant details ...
    })

    workerLogger.info(
      { jobId, taskId },
      'Successfully processed image generation task.',
    )
    await jobQueue.complete(GEN_TASK_QUEUE_NAME, jobId)
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    workerLogger.error(
      { jobId, taskId, err: err.message, stack: err.stack },
      'Error in image generation task handler',
    )
    publishTaskError(taskId, {
      message: `Error generating image: ${err.message}`,
    })
    // VE Refund logic here more robustly
    await refundVibeEnergy(
      userId, // userId from payload
      REQUIRED_VE_FOR_GENERATION,
      VE_REFUND_REASON_GENERATION_FAILURE,
      taskId, // taskId from payload
      jobId, // jobId from the job object
    )
    // Mark job as failed, pg-boss will handle retries based on queue config
    // Check jobQueue again to satisfy linter, though it's checked at the start.
    if (jobQueue) {
      await jobQueue.fail(GEN_TASK_QUEUE_NAME, jobId, {
        message: err.message,
        stack: err.stack,
      })
    } else {
      // This case should ideally not be reached if the initial check is in place.
      workerLogger.error(
        { jobId, taskId },
        'Job queue became unavailable during error handling. Cannot report failure to pg-boss.',
      )
    }
  }
}
