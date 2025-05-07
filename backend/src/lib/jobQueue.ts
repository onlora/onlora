import * as dotenv from 'dotenv'
import PgBoss from 'pg-boss'
import pino from 'pino'

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

const jobQueue = new PgBoss(connectionString || '')

// General error handler for pg-boss
jobQueue.on('error', (error: unknown) => {
  if (error instanceof Error) {
    logger.error(
      { err: { message: error.message, stack: error.stack, name: error.name } },
      'Job queue encountered an error',
    )
  } else {
    logger.error(
      { errorObject: error },
      'Job queue encountered an unknown error object',
    )
  }
})

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
  if (!connectionString) {
    logger.warn('Job queue is not starting because DATABASE_URL is not set.')
    return null
  }

  try {
    logger.info('Starting job queue (pg-boss)...')
    await jobQueue.start()
    logger.info('Job queue (pg-boss) started successfully.')

    // Schedule cron jobs
    const refreshHotJobName = 'refresh-hot-posts' // More descriptive job name
    await jobQueue.unschedule(refreshHotJobName)
    await jobQueue.schedule(refreshHotJobName, '*/10 * * * *', undefined, {
      tz: 'Etc/UTC',
    })
    logger.info(
      `Scheduled job: ${refreshHotJobName} to run every 10 minutes (UTC).`,
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
