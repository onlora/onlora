import { sql } from 'drizzle-orm'
import cron from 'node-cron'
import { db } from '../db'

const REFRESH_INTERVAL = '*/10 * * * *' // Every 10 minutes

/**
 * Refreshes the mv_post_hot materialized view.
 */
async function refreshHotPostsView(): Promise<void> {
  console.log('Refreshing mv_post_hot materialized view...')
  try {
    // It's crucial to use CONCURRENTLY to avoid locking the table.
    // This requires the view to have a UNIQUE index.
    // The mv_post_hot.sql file already defines a UNIQUE index on id.
    await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_post_hot;`)
    console.log('mv_post_hot materialized view refreshed successfully.')
  } catch (error) {
    console.error('Error refreshing mv_post_hot materialized view:', error)
  }
}

/**
 * Initializes the cron job to refresh the hot posts view.
 */
export function initRefreshHotViewWorker(): void {
  console.log(
    `Scheduling refresh of mv_post_hot every 10 minutes (cron: ${REFRESH_INTERVAL})`,
  )

  // Schedule the task. Removed timezone option to use server default.
  cron.schedule(REFRESH_INTERVAL, refreshHotPostsView)

  // Optionally, run once on startup if needed (after a short delay)
  // setTimeout(refreshHotPostsView, 5000); // e.g., 5 seconds after start
}

// Ensure the worker is initialized if this file is imported directly
// or called as part of the application startup.
// Depending on your application structure, you might call initRefreshHotViewWorker()
// from your main application entry point (e.g., index.ts or server.ts).
