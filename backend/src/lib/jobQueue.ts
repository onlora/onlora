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
  name: 'pg-boss-job-queue',
})

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  logger.error(
    'DATABASE_URL environment variable is not set. Job queue cannot operate.',
  )
}

const bossConstructorOptions: ConstructorOptions = {
  connectionString,
  max: 10,
  application_name: 'onlora-pgboss', // Changed application_name for clarity
}

const jobQueueInstance = connectionString
  ? new PgBoss(bossConstructorOptions)
  : null

if (jobQueueInstance) {
  jobQueueInstance.on('error', (error: unknown) => {
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

/**
 * Starts the pg-boss instance and registers all workers and cron jobs.
 * This should be called by the dedicated worker process.
 */
export const startAndRegisterWorkers = async () => {
  if (!jobQueueInstance) {
    logger.warn(
      'Job queue (pg-boss) is not starting because DATABASE_URL is not set.',
    )
    return
  }

  try {
    logger.info('Starting job queue (pg-boss) for worker process...')
    await jobQueueInstance.start() // Idempotent, ensures DB schema and connection
    logger.info('Job queue (pg-boss) started successfully for worker.')

    // --- Register Workers ---
    const genTaskWorkOptions: WorkOptions = {}
    await jobQueueInstance.work(
      GEN_TASK_QUEUE_NAME,
      genTaskWorkOptions,
      handleGenerateImageTask,
    )
    logger.info(`Worker registered for queue: ${GEN_TASK_QUEUE_NAME}`)

    await jobQueueInstance.work(
      REFRESH_HOT_QUEUE_NAME,
      {},
      handleRefreshHotPosts,
    )
    logger.info(`Worker registered for queue: ${REFRESH_HOT_QUEUE_NAME}`)

    // --- Schedule Cron Jobs ---
    try {
      await jobQueueInstance.unschedule(REFRESH_HOT_QUEUE_NAME)
      logger.info(
        `Unscheduled existing cron job (if any) for queue: ${REFRESH_HOT_QUEUE_NAME}`,
      )
    } catch (unscheduleError) {
      logger.debug(
        { err: unscheduleError, queueName: REFRESH_HOT_QUEUE_NAME },
        'Attempted to unschedule cron job, may not have existed.',
      )
    }

    await jobQueueInstance.schedule(
      REFRESH_HOT_QUEUE_NAME,
      REFRESH_HOT_CRON_SCHEDULE,
      undefined,
      { tz: 'Etc/UTC', singletonKey: REFRESH_HOT_QUEUE_NAME },
    )
    logger.info(
      `Cron job for queue: ${REFRESH_HOT_QUEUE_NAME} scheduled with cron: ${REFRESH_HOT_CRON_SCHEDULE} (UTC).`,
    )
  } catch (error: unknown) {
    const errToLog = error instanceof Error ? error : new Error(String(error))
    logger.error(
      { err: errToLog },
      'Failed to start and register workers (pg-boss)',
    )
    throw errToLog // Re-throw to allow worker process to potentially exit or handle
  }
}

/**
 * Initializes and starts the pg-boss instance for the API server (for sending jobs).
 * Does not register workers or cron jobs.
 */
export const initializeBossForApi = async () => {
  if (!jobQueueInstance) {
    logger.warn(
      'Job queue (pg-boss) instance not created due to missing DATABASE_URL.',
    )
    return
  }
  try {
    logger.info('Initializing pg-boss for API server (idempotent start)...')
    await jobQueueInstance.start() // Ensures schema is set up, connects.
    logger.info('pg-boss initialized successfully for API server.')
  } catch (error) {
    const errToLog = error instanceof Error ? error : new Error(String(error))
    logger.error(
      { err: errToLog },
      'Failed to initialize pg-boss for API server.',
    )
    // Depending on policy, might want to throw or let API start without job sending capabilities
    throw errToLog
  }
}

// Export the jobQueue instance directly for publishing/sending jobs
export default jobQueueInstance
