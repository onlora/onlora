import type { Context, Next } from 'hono'
import pino from 'pino' // Optional: for logging
import { auth } from '../lib/auth' // Path to your better-auth instance

const logger = pino({ name: 'auth-middleware' })

export interface AuthenticatedContextEnv {
  Variables: {
    user?: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>['user']
    session?: Awaited<ReturnType<typeof auth.api.getSession>>
  }
}

/**
 * Hono middleware to verify JWT and attach user session to context.
 * It uses better-auth's auth.api.getSession().
 */
export const authMiddleware = async (
  c: Context<AuthenticatedContextEnv>,
  next: Next,
) => {
  try {
    // better-auth's getSession typically uses headers (cookies) from the standard Request object
    const session = await auth.api.getSession({ headers: c.req.raw.headers })

    if (session && session.user) {
      c.set('user', session.user)
      c.set('session', session)
      logger.info({ userId: session.user?.id }, 'User authenticated')
    } else {
      // No active session, or session is invalid
      // Depending on the route, you might want to return a 401 here
      // or allow the request to proceed if auth is optional for the route.
      // For now, just log and proceed. Routes can check c.get('user').
      logger.info('No active user session found or session invalid.')
      // To enforce authentication, uncomment the next lines:
      // return c.json({ message: 'Unauthorized' }, 401);
    }
  } catch (error) {
    logger.error({ err: error }, 'Error in auth middleware during getSession')
    // Potentially return 500 or a generic auth error
    // return c.json({ message: 'Authentication error' }, 500);
  }
  await next()
}

/**
 * Middleware to ensure that a user is authenticated.
 * If not, it returns a 401 Unauthorized response.
 */
export const requireAuthMiddleware = async (
  c: Context<AuthenticatedContextEnv>,
  next: Next,
) => {
  // First, run the standard authMiddleware to populate c.get('user') if a session exists
  await authMiddleware(c, async () => {}) // Call with a no-op next to just populate context

  const user = c.get('user')
  if (!user) {
    logger.warn({ path: c.req.path }, 'Access denied: Authentication required.')
    return c.json(
      { code: 401, message: 'Unauthorized: Authentication required' },
      401,
    )
  }
  // User is authenticated, proceed to the next handler
  await next()
}

/**
 * Hono middleware that attempts to verify JWT and attach user session to context,
 * but does NOT block the request if the user is not authenticated.
 * It populates c.var.user and c.var.session if a valid session exists.
 */
export const optionalAuthMiddleware = async (
  c: Context<AuthenticatedContextEnv>,
  next: Next,
) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })

    if (session && session.user) {
      c.set('user', session.user)
      c.set('session', session)
      logger.info(
        { userId: session.user?.id },
        'User context populated (optional auth)',
      )
    } else {
      logger.info('No active user session for optional auth.')
      // User and session will remain undefined in context
    }
  } catch (error) {
    logger.error(
      { err: error },
      'Error in optionalAuthMiddleware during getSession',
    )
    // Do not block request, just log error. User context will be missing.
  }
  await next()
}
