import { eq, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { db } from '../db'
import { comments, notifications, posts } from '../db/schema'

// UUID validation pattern
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Zod schema for creating a comment
export const createCommentSchema = z.object({
  postId: z.string().regex(uuidPattern, 'Post ID must be a valid UUID'),
  body: z.string().min(1, 'Comment body cannot be empty').max(5000), // Limit comment length
  parentId: z
    .string()
    .regex(uuidPattern, 'Parent ID must be a valid UUID')
    .optional(), // Optional for replies
})

export type CreateCommentData = z.infer<typeof createCommentSchema>

/**
 * Creates a comment on a post
 * @param payload The comment data
 * @param userId The ID of the user creating the comment
 * @returns The created comment with user details
 */
export async function createComment(
  payload: CreateCommentData,
  userId: string,
) {
  return await db.transaction(async (tx) => {
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

    // 6. Fetch and return the comment with user details
    const commentWithUser = await tx.query.comments.findFirst({
      where: eq(comments.id, newComment.id),
      with: {
        user: {
          columns: { id: true, name: true, image: true, username: true },
        },
      },
    })

    return commentWithUser
  })
}

/**
 * Gets comments for a post
 * @param postId The ID of the post
 * @returns An array of comments with their authors
 */
export async function getCommentsByPostId(postId: string) {
  const commentsData = await db.query.comments.findMany({
    where: eq(comments.postId, postId),
    with: {
      user: {
        columns: { id: true, name: true, image: true, username: true },
      },
    },
    orderBy: [sql`${comments.createdAt} asc`],
  })

  // Map to desired response structure (rename user to author)
  return commentsData.map((comment) => ({
    ...comment,
    author: comment.user,
    user: undefined, // Remove the original user field
  }))
}
