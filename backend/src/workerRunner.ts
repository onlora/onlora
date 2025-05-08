import * as dotenv from 'dotenv'
import pino from 'pino'
import { startAndRegisterWorkers } from './lib/jobQueue'

// Load environment variables (especially DATABASE_URL)
// Ensure path is correct if .env.local is in backend/ root, relative to src/
dotenv.config({ path: '../.env.local' })

const runnerLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty' }
      : undefined,
  name: 'onlora-worker-runner',
})

async function main() {
  runnerLogger.info('Starting Onlora worker process...')
  try {
    await startAndRegisterWorkers()
    runnerLogger.info(
      'Worker process started and tasks registered successfully.',
    )
    // Keep the process alive. For pg-boss, once .work() is called, it keeps listening.
    // No explicit keep-alive loop is usually needed here unless other async tasks run and exit.
  } catch (error) {
    runnerLogger.fatal(
      { err: error },
      'Failed to start worker process. Exiting.',
    )
    process.exit(1) // Exit if worker initialization fails critically
  }
}

main()
