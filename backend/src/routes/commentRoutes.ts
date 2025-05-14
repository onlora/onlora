import { zValidator } from '@hono/zod-validator'
import { and, eq, sql } from 'drizzle-orm'
import { type Context, Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { db } from '../db' // Import db
import { commentLikes, comments } from '../db/schema' // Import schema
import {
  type AuthenticatedContextEnv,
  requireAuthMiddleware,
} from '../middleware/auth'
import { createComment, createCommentSchema } from '../services/commentService'

// Define the specific Environment for this router
interface CommentRoutesAppEnv extends AuthenticatedContextEnv {}

const commentRoutes = new Hono<CommentRoutesAppEnv>()

// Zod schema for commentId param
const commentIdParamSchema = z.object({
  commentId: z.string().uuid('Comment ID must be a valid UUID'),
})

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

// POST /api/comments/:commentId/like - Like or unlike a comment
commentRoutes.post(
  '/:commentId/like',
  requireAuthMiddleware,
  zValidator('param', commentIdParamSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: 'Invalid comment ID format' }, 400)
    }
  }),
  async (c) => {
    const user = c.get('user')
    if (!user) return c.json({ error: 'User not authenticated' }, 401)
    const userId = user.id

    const { commentId } = c.req.valid('param')

    try {
      const result = await db.transaction(async (tx) => {
        const commentExists = await tx.query.comments.findFirst({
          where: eq(comments.id, commentId),
          columns: { id: true, likeCount: true },
        })

        if (!commentExists) {
          throw new HTTPException(404, { message: 'Comment not found' })
        }

        const existingLike = await tx.query.commentLikes.findFirst({
          where: and(
            eq(commentLikes.commentId, commentId),
            eq(commentLikes.userId, userId),
          ),
        })

        let liked: boolean
        let currentLikeCount: number = commentExists.likeCount ?? 0

        if (existingLike) {
          // Unlike
          await tx
            .delete(commentLikes)
            .where(
              and(
                eq(commentLikes.commentId, commentId),
                eq(commentLikes.userId, userId),
              ),
            )
          await tx
            .update(comments)
            .set({ likeCount: sql`GREATEST(0, ${comments.likeCount} - 1)` })
            .where(eq(comments.id, commentId))
          liked = false
          currentLikeCount = Math.max(0, currentLikeCount - 1)
        } else {
          // Like
          await tx
            .insert(commentLikes)
            .values({ commentId, userId, createdAt: new Date() })
          await tx
            .update(comments)
            .set({ likeCount: sql`${comments.likeCount} + 1` })
            .where(eq(comments.id, commentId))
          liked = true
          currentLikeCount = currentLikeCount + 1
        }
        return { liked, likeCount: currentLikeCount }
      })
      return c.json(result)
    } catch (error) {
      if (error instanceof HTTPException) throw error
      console.error('Error liking/unliking comment:', error)
      return c.json({ error: 'Failed to update like status' }, 500)
    }
  },
)

export default commentRoutes
