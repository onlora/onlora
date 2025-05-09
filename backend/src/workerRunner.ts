import pino from 'pino'
import { config } from './config'
import { startAndRegisterWorkers } from './lib/jobQueue'

const runnerLogger = pino({
  level: config.logLevel,
  transport:
    config.nodeEnv !== 'production' // Use nodeEnv from centralized config
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
