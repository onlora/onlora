import { zValidator } from '@hono/zod-validator'
import { eq, sql } from 'drizzle-orm'
import { type Context, Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { db } from '../db'
import { comments, notifications, posts } from '../db/schema'
import {
  type AuthenticatedContextEnv,
  requireAuthMiddleware,
} from '../middleware/auth'

// Zod schema for creating a comment
const createCommentSchema = z.object({
  postId: z.number().int().positive('Post ID must be positive'),
  body: z.string().min(1, 'Comment body cannot be empty').max(5000), // Limit comment length
  parentId: z.number().int().positive().optional(), // Optional for replies
})

type CreateCommentValidatedData = z.infer<typeof createCommentSchema>

// Define the specific Environment for this router
interface CommentRoutesAppEnv extends AuthenticatedContextEnv {}

const commentRoutes = new Hono<CommentRoutesAppEnv>()

// POST /api/comments - Create a new comment
commentRoutes.post(
  '/',
  requireAuthMiddleware,
  // Use zValidator for early exit, but parse manually for typed payload
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

    let payload: CreateCommentValidatedData
    try {
      const jsonPayload = await c.req.json()
      payload = createCommentSchema.parse(jsonPayload)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new HTTPException(400, {
          message: 'Invalid comment data',
          cause: error,
        })
      }
      throw new HTTPException(400, { message: 'Invalid request body' })
    }

    try {
      const result = await db.transaction(async (tx) => {
        // 1. Check if parent comment exists if parentId is provided (optional)
        if (payload.parentId) {
          const parentComment = await tx.query.comments.findFirst({
            where: eq(comments.id, payload.parentId),
            columns: { id: true, postId: true },
          })
          // Ensure parent comment exists and belongs to the same post
          if (!parentComment || parentComment.postId !== payload.postId) {
            throw new HTTPException(400, {
              message: 'Invalid parent comment specified',
            })
          }
        }

        // 2. Check if post exists and get author ID
        const post = await tx.query.posts.findFirst({
          where: eq(posts.id, payload.postId),
          columns: { id: true, authorId: true }, // Get authorId
        })
        if (!post) {
          throw new HTTPException(404, { message: 'Post not found' })
        }
        const postAuthorId = post.authorId

        // 3. Insert the new comment
        const [newComment] = await tx
          .insert(comments)
          .values({
            postId: payload.postId,
            userId: userId,
            body: payload.body,
            parentId: payload.parentId, // Will be null if not provided
          })
          .returning() // Return all columns of the new comment

        if (!newComment) {
          throw new Error('Failed to insert comment') // Internal error
        }

        // 4. Increment the comment count on the post
        await tx
          .update(posts)
          .set({ commentCount: sql`${posts.commentCount} + 1` })
          .where(eq(posts.id, payload.postId))

        // 5. Insert Notifications
        let parentCommentAuthorId: string | null | undefined = null

        // 5a. Handle 'reply' notification if parentId exists
        if (payload.parentId) {
          const parentComment = await tx.query.comments.findFirst({
            where: eq(comments.id, payload.parentId),
            columns: { userId: true }, // Get parent comment author
          })
          parentCommentAuthorId = parentComment?.userId
          // Notify parent comment author if they are not the one replying
          if (parentCommentAuthorId && parentCommentAuthorId !== userId) {
            await tx.insert(notifications).values({
              recipientId: parentCommentAuthorId,
              actorId: userId,
              type: 'reply',
              postId: payload.postId,
              commentId: newComment.id, // Link to the new reply comment
              isRead: false,
            })
          }
        }

        // 5b. Handle 'comment' notification for post author
        // Notify post author if they aren't the commenter and aren't the parent author (to avoid double notification on self-reply)
        if (
          postAuthorId &&
          postAuthorId !== userId &&
          postAuthorId !== parentCommentAuthorId
        ) {
          await tx.insert(notifications).values({
            recipientId: postAuthorId,
            actorId: userId,
            type: 'comment',
            postId: payload.postId,
            commentId: newComment.id, // Link to the new comment
            isRead: false,
          })
        }

        // 6. Fetch author details for the response (optional, but good UX)
        // Note: `user` from context might not have all details like avatar
        // Fetch fresh user data if needed, or just use context data.
        const commentAuthor = {
          id: user.id,
          name: user.name,
          image: user.image,
        }

        // Return the newly created comment with author info
        return { ...newComment, author: commentAuthor }
      })

      // Return 201 Created status
      return c.json(result, 201)
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error // Re-throw HTTP exceptions
      }
      console.error(
        `Error creating comment for post ${payload.postId} by user ${userId}:`,
        error,
      )
      throw new HTTPException(500, { message: 'Failed to create comment' })
    }
  },
)

export default commentRoutes
