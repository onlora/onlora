import { zValidator } from '@hono/zod-validator'
import { type Context, Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import {
  type AuthenticatedContextEnv,
  requireAuthMiddleware,
} from '../middleware/auth'
import { createComment, createCommentSchema } from '../services/commentService'

// Define the specific Environment for this router
interface CommentRoutesAppEnv extends AuthenticatedContextEnv {}

const commentRoutes = new Hono<CommentRoutesAppEnv>()

// POST /api/comments - Create a new comment
commentRoutes.post(
  '/',
  requireAuthMiddleware,
  zValidator('json', createCommentSchema, (result, c) => {
    if (!result.success) {
      throw new HTTPException(400, {
        message: 'Invalid comment data',
        cause: result.error,
      })
    }
  }),
  async (c: Context<CommentRoutesAppEnv>) => {
    const user = c.get('user')
    if (!user || !user.id) {
      throw new HTTPException(401, { message: 'Authentication required' })
    }
    const userId = user.id

    try {
      const payload = await c.req.json()
      // Use the service function
      const result = await createComment(payload, userId)

      // Return 201 Created status
      return c.json(result, 201)
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error // Re-throw HTTP exceptions
      }
      if (error instanceof z.ZodError) {
        throw new HTTPException(400, {
          message: 'Invalid comment data',
          cause: error,
        })
      }
      console.error('Error creating comment:', error)
      throw new HTTPException(500, { message: 'Failed to create comment' })
    }
  },
)

export default commentRoutes
