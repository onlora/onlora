import * as dotenv from 'dotenv'
import PgBoss, { type ConstructorOptions, type WorkOptions } from 'pg-boss'
import pino from 'pino'
import {
  GEN_TASK_QUEUE_NAME,
  REFRESH_HOT_CRON_SCHEDULE,
  REFRESH_HOT_QUEUE_NAME,
} from '../config/queues'
import { handleGenerateImageTask } from '../workers/genTaskWorker'
import { handleRefreshHotPosts } from '../workers/refreshHotWorker'

// Load environment variables
dotenv.config({ path: '../.env.local' }) // Assuming .env.local is in backend/, relative to src/lib/

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty' }
      : undefined,
  name: 'pg-boss-job-queue', // More descriptive logger name
})

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  logger.error(
    'DATABASE_URL environment variable is not set. Job queue cannot start.',
  )
  // Consider if to throw error or let app start without job queue
}

const bossConstructorOptions: ConstructorOptions = {
  connectionString,
  max: 10, // Max pool connections for pg-boss
  application_name: 'onlora-worker',
}

const jobQueue = connectionString ? new PgBoss(bossConstructorOptions) : null

// General error handler for pg-boss
if (jobQueue) {
  jobQueue.on('error', (error: unknown) => {
    if (error instanceof Error) {
      logger.error(
        {
          err: { message: error.message, stack: error.stack, name: error.name },
        },
        'Job queue encountered an error',
      )
    } else {
      logger.error(
        { errorObject: error },
        'Job queue encountered an unknown error object',
      )
    }
  })
}

// Commenting out specific error event handlers for now to resolve typing issues
// jobQueue.on('monitor-states.error', (payload: any) => {
//   logger.error({ eventPayload: payload }, 'Job queue monitor-states error')
// })
// jobQueue.on('maintenance.error', (payload: any) => {
//   logger.error({ eventPayload: payload }, 'Job queue maintenance error')
// })
// jobQueue.on('wip.error', (payload: any) => {
//   logger.error({ eventPayload: payload }, 'Job queue wip error')
// })

export const startJobQueue = async () => {
  if (!jobQueue) {
    logger.warn('Job queue is not starting because DATABASE_URL is not set.')
    return null
  }

  try {
    logger.info('Starting job queue (pg-boss)...')
    await jobQueue.start()
    logger.info('Job queue (pg-boss) started successfully.')

    // --- Register Workers ---
    // Concurrency is typically managed by the number of worker processes
    // or specific pg-boss settings not directly in WorkOptions here.
    // For now, using default concurrency for a single work registration.
    const genTaskWorkOptions: WorkOptions = {}
    await jobQueue.work(
      GEN_TASK_QUEUE_NAME,
      genTaskWorkOptions, // Pass empty or valid WorkOptions
      handleGenerateImageTask,
    )
    logger.info(
      `Worker registered for queue: ${GEN_TASK_QUEUE_NAME} with default concurrency`,
    )

    // Register worker for refresh-hot queue (even if only used by cron)
    await jobQueue.work(REFRESH_HOT_QUEUE_NAME, {}, handleRefreshHotPosts) // Empty options object
    logger.info(`Worker registered for queue: ${REFRESH_HOT_QUEUE_NAME}`)

    // --- Schedule Cron Jobs ---
    // For cron, pg-boss directly triggers .work on the named queue if the job name for schedule matches the queue name.
    // We will schedule REFRESH_HOT_QUEUE_NAME directly.

    // Attempt to unschedule first to prevent duplicates if re-running startJobQueue
    try {
      await jobQueue.unschedule(REFRESH_HOT_QUEUE_NAME) // Unschedule by queue name
      logger.info(
        `Unscheduled existing cron job (if any) for queue: ${REFRESH_HOT_QUEUE_NAME}`,
      )
    } catch (unscheduleError) {
      logger.debug(
        { err: unscheduleError, queueName: REFRESH_HOT_QUEUE_NAME },
        'Attempted to unschedule cron job, may not have existed.',
      )
    }

    // Schedule the REFRESH_HOT_QUEUE_NAME directly
    await jobQueue.schedule(
      REFRESH_HOT_QUEUE_NAME, // Schedule the queue itself
      REFRESH_HOT_CRON_SCHEDULE,
      undefined, // Data payload is undefined
      { tz: 'Etc/UTC', singletonKey: REFRESH_HOT_QUEUE_NAME }, // Use queue name as singletonKey for uniqueness
    )

    // With pg-boss v10, scheduling a queue name directly ensures the worker for that queue is triggered.
    // The schedule function might not always return a new job ID if the schedule already exists and matches the singletonKey.
    // We rely on pg-boss to manage the schedule idempotently.
    logger.info(
      `Cron job for queue: ${REFRESH_HOT_QUEUE_NAME} scheduled with cron: ${REFRESH_HOT_CRON_SCHEDULE} (UTC). pg-boss will manage it based on singletonKey.`,
    )

    return jobQueue
  } catch (error: unknown) {
    const errToLog = error instanceof Error ? error : new Error(String(error))
    logger.error({ err: errToLog }, 'Failed to start job queue (pg-boss)')
    throw errToLog // Re-throw to be caught by the main app startup
  }
}

// Export the jobQueue instance directly for publishing jobs
export default jobQueue
