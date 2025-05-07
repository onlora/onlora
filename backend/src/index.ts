import { EventEmitter } from 'node:events'
import { serve } from '@hono/node-server'
import { type Context, Hono } from 'hono'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { type SSEStreamingApi, streamSSE } from 'hono/streaming'
import pino from 'pino'
import { auth } from './lib/auth'
import { startJobQueue } from './lib/jobQueue.js'

// Initialize Hono app
const app = new Hono()

// Setup Pino logger
// In production, you might want to use pino.destination to write to a file or a log management service
const pinoLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty' }
      : undefined,
})

// Middleware
app.use(
  '*',
  logger((message: string, ...rest: string[]) =>
    pinoLogger.info(message, ...rest),
  ),
)
app.use('*', secureHeaders()) // Basic security headers

// --- Better Auth Route Handler ---
// This must come before any generic catch-all or notFound handlers
// if they might also match /api/auth/*
app.all('/api/auth/*', async (c) => {
  try {
    // Pass the raw standard Request object to better-auth handler
    const response = await auth.handler(c.req.raw)
    // better-auth handler should return a standard Response object
    return response
  } catch (error) {
    pinoLogger.error(
      { err: error, path: c.req.path, provider: 'better-auth' },
      'Error in better-auth handler',
    )
    return c.json({ message: 'Authentication error' }, 500)
  }
})

// --- SSE Setup ---
// Simple in-memory store for active SSE connections/tasks
// NOTE: This won't scale beyond a single server instance.
// For multi-instance deployments, a Redis pub/sub or similar would be needed.
interface TaskProgressNotifier {
  emit: (event: string, data: unknown) => void
  connClosed: boolean // Flag to check if connection is closed
}
const sseConnections = new Map<string, TaskProgressNotifier>()

// Simple EventEmitter for internal progress updates (pg-boss worker -> SSE handler)
// This assumes pg-boss worker runs in the same process space.
const progressEmitter = new EventEmitter()

// Function for workers to publish progress
export const publishTaskProgress = (taskId: string, progressData: unknown) => {
  progressEmitter.emit(`progress-${taskId}`, progressData)
}

// Add functions for completion/error events if needed
export const publishTaskCompletion = (
  taskId: string,
  completionData: unknown,
) => {
  progressEmitter.emit(`complete-${taskId}`, completionData)
}

export const publishTaskError = (taskId: string, errorData: unknown) => {
  progressEmitter.emit(`error-${taskId}`, errorData)
}
// --- End SSE Setup ---

// Basic Routes
app.get('/', (c) => {
  pinoLogger.info('Root path accessed')
  return c.json({
    message: 'Hello from onlora.ai backend!',
    environment: process.env.NODE_ENV,
  })
})

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Test route for user session (optional, for testing auth middleware later)
// app.get('/api/me', authMiddleware, (c) => { // Assuming authMiddleware is created
//   const user = c.get('user');
//   return c.json({ user });
// });

// --- API Routes (Placeholder for actual application API routes) ---
// Example: app.route('/api/posts', postsRouter); // Assuming postsRouter is defined elsewhere

// Helper function for delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// SSE Route
app.get('/api/tasks/:taskId/events', (c: Context) => {
  const taskId = c.req.param('taskId')
  pinoLogger.info(`SSE connection opened for task: ${taskId}`)

  return streamSSE(
    c,
    async (stream: SSEStreamingApi) => {
      let isConnected = true

      const notifier: TaskProgressNotifier = {
        emit: (event, data) => {
          if (isConnected) {
            try {
              // Ensure data is always stringified
              const dataString =
                typeof data === 'string' ? data : JSON.stringify(data)
              stream.writeSSE({
                event,
                data: dataString,
                id: crypto.randomUUID(),
              })
            } catch (e) {
              pinoLogger.error(
                { taskId, event, data, err: e },
                'Failed to stringify or write SSE data',
              )
            }
          }
        },
        connClosed: false,
      }

      sseConnections.set(taskId, notifier)
      pinoLogger.debug(
        `Notifier set for task ${taskId}. Total connections: ${sseConnections.size}`,
      )

      const progressListener = (data: unknown) => {
        pinoLogger.debug(`Received progress for task ${taskId}`, { data })
        notifier.emit('progress', data)
      }
      progressEmitter.on(`progress-${taskId}`, progressListener)

      const completionListener = (data: unknown) => {
        pinoLogger.info(`Task ${taskId} completed`, { data })
        notifier.emit('complete', data)
        isConnected = false // Signal to stop the loop
        // Don't close the stream immediately, let the loop finish
      }
      progressEmitter.on(`complete-${taskId}`, completionListener)

      const errorListener = (data: unknown) => {
        pinoLogger.error(`Task ${taskId} failed`, { data })
        notifier.emit('error', data)
        isConnected = false // Signal to stop the loop
      }
      progressEmitter.on(`error-${taskId}`, errorListener)

      // Keep connection open loop
      while (isConnected) {
        // Send an empty message or a specific ping event
        await stream.writeSSE({ event: 'ping', data: new Date().toISOString() })
        await delay(20000) // Use helper delay
        if (notifier.connClosed) {
          isConnected = false
        }
      }

      // Cleanup happens after the loop exits
      pinoLogger.info(`SSE stream closing naturally for task: ${taskId}`)
      progressEmitter.off(`progress-${taskId}`, progressListener)
      progressEmitter.off(`complete-${taskId}`, completionListener)
      progressEmitter.off(`error-${taskId}`, errorListener)
      sseConnections.delete(taskId)
      pinoLogger.debug(
        `Notifier removed for task ${taskId}. Total connections: ${sseConnections.size}`,
      )
    },
    async (err: Error, stream: SSEStreamingApi) => {
      // Error handler for stream errors (e.g., client disconnects)
      // We don't have direct access to `c` here, but taskId was captured in the outer scope
      pinoLogger.warn(
        { err: err.message, taskId },
        'SSE stream error or client disconnected',
      )
      const notifier = sseConnections.get(taskId)
      if (notifier) {
        notifier.connClosed = true // Signal the loop to stop
      }
      // No need to explicitly delete here, the main loop's cleanup handles it.
    },
  )
})

// Custom Error Handler
app.onError((err, c) => {
  pinoLogger.error(
    { err, path: c.req.path, method: c.req.method },
    'Unhandled error',
  )
  console.error('Error:', err.message)
  return c.json(
    {
      code: 500,
      message: 'Internal Server Error',
      // Optional: include error details in dev mode
      ...(process.env.NODE_ENV === 'development' && {
        error: err.message,
        stack: err.stack,
      }),
    },
    500,
  )
})

// Not Found Handler
app.notFound((c) => {
  pinoLogger.warn(
    { path: c.req.path, method: c.req.method },
    'Resource not found',
  )
  return c.json({ code: 404, message: 'Not Found' }, 404)
})

// Make sure startServer is defined correctly
const startServer = async () => {
  // Start pg-boss
  try {
    await startJobQueue()
  } catch (error: unknown) {
    const errToLog = error instanceof Error ? error : new Error(String(error))
    pinoLogger.error({ err: errToLog }, 'Failed to start job queue')
    // process.exit(1) // Optional: exit if job queue is critical
  }

  // Start the HTTP server
  const port = Number(process.env.PORT) || 8080
  if (process.env.NODE_ENV !== 'test') {
    // Don't start server during tests
    serve(
      {
        fetch: app.fetch,
        port: port,
      },
      (info) => {
        pinoLogger.info(`🚀 Server listening on http://localhost:${info.port}`)
      },
    )
  }
}

startServer().catch((err) => {
  pinoLogger.fatal({ err }, 'Critical error during server startup')
  process.exit(1)
})

// Export the app for testing or other advanced use cases
export default app
