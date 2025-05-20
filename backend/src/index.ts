import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import pino from 'pino'
import { z } from 'zod'
import { config } from './config'
import { auth } from './lib/auth'
import type { AuthenticatedContextEnv } from './middleware/auth'
import commentRoutes from './routes/commentRoutes'
import feedRoutes from './routes/feedRoutes'
import jamRoutes from './routes/jamRoutes'
import modelRoutes from './routes/modelRoutes'
import postRoutes from './routes/postRoutes'
import searchRoutes from './routes/searchRoutes'
import userRoutes from './routes/userRoutes'
import veAppRoutes from './routes/veRoutes'
import { initRefreshHotViewWorker } from './workers/refreshHotViewWorker'

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
app.use(
  '/api/*',
  cors({
    origin: ['http://localhost:3000', 'https://onlora.ai'],
    credentials: true,
  }),
)

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
app.route('/api/models', modelRoutes)
app.route('/api/ve', veAppRoutes)

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

// Initialize the hot view refresh worker
initRefreshHotViewWorker()

const startServer = async () => {
  try {
    serve({ fetch: app.fetch, port: Number.parseInt(config.port) }, (info) => {
      pinoLogger.info(`🚀 Server listening on http://localhost:${info.port}`)
    })
  } catch (error: unknown) {
    const errToLog = error instanceof Error ? error : new Error(String(error))
    pinoLogger.error({ err: errToLog }, 'Failed to start server')
  }
}

startServer().catch((err) => {
  pinoLogger.fatal({ err }, 'Critical error during server startup')
  process.exit(1)
})

export default app
