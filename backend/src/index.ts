import { EventEmitter } from 'node:events'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import dotenv from 'dotenv'
import { type Context, Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { type SSEStreamingApi, streamSSE } from 'hono/streaming'
import pino from 'pino'
import { z } from 'zod'
import { auth } from './lib/auth'
import { initializeBossForApi } from './lib/jobQueue.js'
import {
  type AuthenticatedContextEnv,
  requireAuthMiddleware,
} from './middleware/auth'
import commentRoutes from './routes/commentRoutes'
import feedRoutes from './routes/feedRoutes'
import jamRoutes from './routes/jamRoutes'
import postRoutes from './routes/postRoutes'
import searchRoutes from './routes/searchRoutes'
import userRoutes from './routes/userRoutes'

interface AppEnv extends AuthenticatedContextEnv {}

const app = new Hono<AppEnv>()

const pinoLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty' }
      : undefined,
})

// Global Middleware
app.use(
  '*',
  logger((message: string, ...rest: string[]) =>
    pinoLogger.info(message, ...rest),
  ),
)
app.use('*', secureHeaders())
app.use('/api/*', cors())

// Static Files
app.use('/', serveStatic({ root: './public' }))
app.use('/favicon.ico', serveStatic({ path: './public/favicon.ico' }))

// Auth Routes
app.all('/api/auth/*', async (c) => {
  try {
    const response = await auth.handler(c.req.raw)
    return response
  } catch (error) {
    pinoLogger.error(
      { err: error, path: c.req.path, provider: 'better-auth' },
      'Error in better-auth handler',
    )
    return c.json({ message: 'Authentication error' }, 500)
  }
})

// Modular API Routes
app.route('/api/jams', jamRoutes)
app.route('/api/posts', postRoutes)
app.route('/api/comments', commentRoutes)
app.route('/api/feed', feedRoutes)
app.route('/api/users', userRoutes)
app.route('/api/search', searchRoutes)

// SSE Infrastructure
interface TaskProgressNotifier {
  emit: (event: string, data: unknown) => void
  connClosed: boolean
}
const sseConnections = new Map<string, TaskProgressNotifier>()
const progressEmitter = new EventEmitter()

export const publishTaskProgress = (taskId: string, progressData: unknown) => {
  progressEmitter.emit(`progress-${taskId}`, progressData)
}
export const publishTaskCompletion = (
  taskId: string,
  completionData: unknown,
) => {
  progressEmitter.emit(`complete-${taskId}`, completionData)
}
export const publishTaskError = (taskId: string, errorData: unknown) => {
  progressEmitter.emit(`error-${taskId}`, errorData)
}

// Basic public routes
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

// SSE route for task progress
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
app.get(
  '/api/tasks/:taskId/events',
  requireAuthMiddleware,
  (c: Context<AppEnv>) => {
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
                const dataString =
                  typeof data === 'string' ? data : JSON.stringify(data)
                stream.writeSSE({
                  event,
                  data: dataString,
                  id: `${Date.now()}-${Math.random()}`,
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
          isConnected = false
        }
        progressEmitter.on(`complete-${taskId}`, completionListener)

        const errorListener = (data: unknown) => {
          pinoLogger.error(`Task ${taskId} failed`, { data })
          notifier.emit('error', data)
          isConnected = false
        }
        progressEmitter.on(`error-${taskId}`, errorListener)

        while (isConnected) {
          await stream.writeSSE({
            event: 'ping',
            data: new Date().toISOString(),
          })
          await delay(20000)
          if (notifier.connClosed) {
            isConnected = false
          }
        }

        pinoLogger.info(`SSE stream closing naturally for task: ${taskId}`)
        progressEmitter.off(`progress-${taskId}`, progressListener)
        progressEmitter.off(`complete-${taskId}`, completionListener)
        progressEmitter.off(`error-${taskId}`, errorListener)
        sseConnections.delete(taskId)
        pinoLogger.debug(
          `Notifier removed for task ${taskId}. Total connections: ${sseConnections.size}`,
        )
      },
      async (err: Error) => {
        const taskId = c.req.param('taskId')
        pinoLogger.warn(
          { err: err.message, taskId },
          'SSE stream error or client disconnected',
        )
        const notifier = sseConnections.get(taskId)
        if (notifier) {
          notifier.connClosed = true
        }
      },
    )
  },
)

// Global Error Handler
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse()
  }
  pinoLogger.error(
    { err, path: c.req.path, method: c.req.method },
    'Unhandled error in Hono app',
  )
  if (err instanceof z.ZodError) {
    return c.json(
      { code: 400, message: 'Validation failed', errors: err.errors },
      400,
    )
  }
  return c.json(
    {
      code: 500,
      message: 'Internal Server Error',
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

// Load environment variables
dotenv.config()

const startServer = async () => {
  try {
    await initializeBossForApi()
  } catch (error: unknown) {
    const errToLog = error instanceof Error ? error : new Error(String(error))
    pinoLogger.error(
      { err: errToLog },
      'Failed to initialize job queue for API',
    )
  }
  const port = Number(process.env.PORT) || 8080
  if (process.env.NODE_ENV !== 'test') {
    serve({ fetch: app.fetch, port: port }, (info) => {
      pinoLogger.info(`🚀 Server listening on http://localhost:${info.port}`)
    })
  }
}

startServer().catch((err) => {
  pinoLogger.fatal({ err }, 'Critical error during server startup')
  process.exit(1)
})

export default app
