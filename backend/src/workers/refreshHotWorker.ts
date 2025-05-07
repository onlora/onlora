import { sql } from 'drizzle-orm'
import pino from 'pino'
import { db } from '../db'

const workerLogger = pino({
  name: 'refresh-hot-worker',
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty' }
      : undefined,
})

/**
 * Handles a job from the 'refresh-hot' queue to refresh the materialized view.
 */
export const handleRefreshHotPosts = async () => {
  // Job payload is not expected/used for this cron-like task, but pg-boss might pass an empty one.
  workerLogger.info('Starting refresh of materialized view: mv_post_hot')

  try {
    // Directly execute the SQL to refresh the materialized view.
    // Ensure the database user has permissions to refresh materialized views.
    await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_post_hot;`)
    workerLogger.info(
      'Successfully refreshed materialized view: mv_post_hot (CONCURRENTLY)',
    )
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    workerLogger.error(
      { err: err.message, stack: err.stack },
      'Error refreshing materialized view: mv_post_hot',
    )
    // For cron jobs, failing typically means it will try again on the next schedule.
    // No specific job.fail() is needed unless pg-boss uses a job entry for cron items that needs explicit failure.
    // For scheduled tasks, pg-boss usually just re-runs them on schedule.
    // If this were a one-off job, we'd mark it as failed.
    throw err // Re-throw to let pg-boss handle it as per its cron/schedule error handling.
  }
}
