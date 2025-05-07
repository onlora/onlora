import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import pino from 'pino'

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

// Start the server
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

// Export the app for testing or other advanced use cases
export default app
