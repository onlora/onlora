import { zValidator } from '@hono/zod-validator'
import { and, asc, eq, sql } from 'drizzle-orm'
import { type Context, Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { db } from '../db' // Adjust path as needed
import {
  images,
  likes,
  postImages,
  posts,
  users,
  veTxns,
  visibilityEnum,
} from '../db/schema' // Adjust path as needed
import { comments as commentsSchema } from '../db/schema' // Import schema explicitly for typing
import {
  type AuthenticatedContextEnv,
  requireAuthMiddleware,
} from '../middleware/auth' // Changed to AuthenticatedContextEnv

// Zod schema for post creation payload
const createPostSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().max(10000).optional(), // Corresponds to bodyMd
  tags: z.array(z.string().max(50)).max(10).optional().default([]),
  visibility: z.enum(visibilityEnum.enumValues), // Use the enum from schema
  imageIds: z
    .array(z.number().int().positive())
    .min(1, 'At least one image is required')
    .max(10), // Max 10 images per post
  jamId: z.number().int().positive().optional(), // Optional: to link post back to its origin jam
  // Remix-specific fields (optional)
  parentPostId: z.number().int().positive().optional(),
  rootPostId: z.number().int().positive().optional(),
  generation: z.number().int().nonnegative().optional(),
})

// Define the specific type for the validated data from this schema
// This helps in typing the payload explicitly if needed, or for inference.
type CreatePostValidatedData = z.infer<typeof createPostSchema>

// Zod schema for postId param
const postIdParamSchema = z.object({
  postId: z
    .string()
    .regex(/^\d+$/, 'Post ID must be a positive integer.')
    .transform(Number),
})

// --- Zod schema for the response of the clone endpoint ---
const postCloneDataSchema = z.object({
  title: z.string().optional(), // e.g., "Remix: Original Title"
  tags: z.array(z.string()).optional(),
  coverImgUrl: z.string().url().optional(),
  // imageIds: z.array(z.number().int().positive()).optional(), // If we decide to clone image associations by ID
  parentPostId: z.number().int().positive(),
  rootPostId: z.number().int().positive(),
  generation: z.number().int().nonnegative(),
  // Potentially a snippet of bodyMd if desired
})

// Define the specific Environment for this router, including Variables and potential ValidatedData shapes
// Note: ValidatedData might not be strictly necessary here if we parse manually inside handlers
interface PostRoutesAppEnv extends AuthenticatedContextEnv {}

const postRoutes = new Hono<PostRoutesAppEnv>()

// --- Helper Type for DB Query Result ---
// Manually define the expected shape based on the query with relations
// Adjust field nullability based on your schema and query logic
interface PostQueryResult {
  id: number
  title: string | null
  bodyMd: string | null
  tags: string[] | null
  visibility: 'public' | 'private' | null
  coverImg: string | null
  authorId: string | null
  createdAt: Date | null
  likeCount: number | null
  commentCount: number | null
  remixCount: number | null
  viewCount: number | null
  parentPostId: number | null
  rootPostId: number | null
  generation: number | null
  author: {
    id: string
    username: string
    name: string | null // Assuming name is nullable based on schema
    image: string | null
  } | null // Author relation might be null if authorId is null
  postImages: Array<{
    id: number
    postId: number
    imageId: number
    createdAt: Date | null
    image: {
      id: number
      url: string
    } | null // Image relation might be null
  }>
  parentPost?: {
    // Added parentPost to the result type
    id: number
    title: string | null
    author: {
      id: string
      username: string
      name: string | null
    } | null
  } | null
}

// --- Helper Type for Comment Query Result ---
// Manually define the expected shape of a comment with its user relation
interface CommentWithUser {
  id: number
  postId: number
  userId: string | null
  parentId: number | null
  body: string
  createdAt: Date | null
  user: {
    // Define the nested user structure based on selected columns
    id: string
    name: string | null
    image: string | null
    username: string | null
  } | null // User might be null if userId is null in comments table
}

// POST /api/posts - Create a new post
postRoutes.post(
  '/',
  requireAuthMiddleware,
  // Remove explicit type for result, let TS infer. Keep explicit return type.
  zValidator('json', createPostSchema, (result, c): Response | undefined => {
    if (!result.success) {
      return c.json(
        { error: 'Validation failed', details: result.error.flatten() },
        400,
      )
    }
    return undefined
  }),
  async (c: Context<PostRoutesAppEnv>) => {
    const user = c.get('user')
    if (!user || !user.id) {
      return c.json({ error: 'User not authenticated or ID missing' }, 401)
    }
    const userId = user.id

    try {
      // Manual parsing for robust typing
      const jsonPayload = await c.req.json()
      const payload = createPostSchema.parse(jsonPayload)

      const firstImageId = payload.imageIds[0]
      const coverImageRecord = await db.query.images.findFirst({
        where: eq(images.id, firstImageId),
        columns: { url: true },
      })

      if (!coverImageRecord || !coverImageRecord.url) {
        return c.json({ error: 'Cover image not found or URL is missing' }, 400)
      }
      const coverImgUrl = coverImageRecord.url

      const result = await db.transaction(async (tx) => {
        // 1. Insert the new post
        const [newPost] = await tx
          .insert(posts)
          .values({
            authorId: userId,
            title: payload.title,
            bodyMd: payload.description,
            tags: payload.tags,
            visibility: payload.visibility,
            coverImg: coverImgUrl,
            jamSessionId: payload.jamId,
            // Add remix fields if they exist
            parentPostId: payload.parentPostId,
            rootPostId: payload.rootPostId,
            generation: payload.generation,
          })
          .returning({ id: posts.id })

        if (!newPost || !newPost.id) {
          throw new Error('Failed to create post record.')
        }
        const postId = newPost.id

        // 2. Link images to the post
        const postImageEntries = payload.imageIds.map((imageId) => ({
          postId: postId,
          imageId: imageId,
        }))
        await tx.insert(postImages).values(postImageEntries)

        // 3. Handle VE grant for public post AND update image visibility
        if (payload.visibility === 'public') {
          const veGrantPublic = 2
          await tx
            .update(users)
            .set({ vibe_energy: sql`${users.vibe_energy} + ${veGrantPublic}` })
            .where(eq(users.id, userId))

          await tx.insert(veTxns).values({
            userId: userId,
            delta: veGrantPublic,
            reason: 'publish_public_post', // Standardized reason
            refId: postId,
          })

          // Also set images to public
          if (payload.imageIds.length > 0) {
            await tx
              .update(images)
              .set({ isPublic: true })
              .where(sql`${images.id} IN ${payload.imageIds}`)
          }
        }

        // 4. Handle Remix-specific updates (if parentPostId is provided AND the new post is public)
        if (payload.parentPostId && payload.visibility === 'public') {
          // Find the parent post author ID
          const parentPost = await tx.query.posts.findFirst({
            where: eq(posts.id, payload.parentPostId),
            columns: { authorId: true },
          })

          if (!parentPost || !parentPost.authorId) {
            console.warn(
              `Parent post ${payload.parentPostId} or its author not found during remix processing for public post ${postId}.`,
            )
          } else {
            const parentAuthorId = parentPost.authorId
            const veGrantRemix = 1

            // Increment remix_count on parent post
            await tx
              .update(posts)
              .set({ remixCount: sql`${posts.remixCount} + 1` })
              .where(eq(posts.id, payload.parentPostId))

            // Grant VE to parent post author
            await tx
              .update(users)
              .set({ vibe_energy: sql`${users.vibe_energy} + ${veGrantRemix}` })
              .where(eq(users.id, parentAuthorId))

            // Record VE transaction for parent author
            await tx.insert(veTxns).values({
              userId: parentAuthorId,
              delta: veGrantRemix,
              reason: 'remix_bonus', // Reason for the parent author receiving VE
              refId: postId, // Reference to the NEW post (the remix)
            })
          }
        }

        return { postId }
      })

      return c.json(result, 201)
    } catch (error) {
      // Handle potential ZodError from manual parse
      if (error instanceof z.ZodError) {
        return c.json(
          { error: 'Validation failed', details: error.flatten() },
          400,
        )
      }
      console.error('Error creating post:', error)
      const errorMessage =
        error instanceof Error ? error.message : 'Internal server error'
      return c.json(
        { error: 'Failed to create post', details: errorMessage },
        500,
      )
    }
  },
)

// GET /api/posts/:postId - Fetch a single post
postRoutes.get(
  '/:postId',
  // Keep zValidator for params, but parse manually
  zValidator('param', postIdParamSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: 'Invalid Post ID format', details: result.error.flatten() },
        400,
      )
    }
  }),
  async (c: Context<PostRoutesAppEnv>) => {
    const user = c.get('user')

    try {
      const params = postIdParamSchema.parse(c.req.param())
      const postId = params.postId

      // Increment view_count.
      try {
        await db
          .update(posts)
          .set({ viewCount: sql`${posts.viewCount} + 1` })
          .where(eq(posts.id, postId))
      } catch (incrementError) {
        console.error(
          `Error incrementing view count for post ${postId}:`,
          incrementError,
        )
      }

      const postData = (await db.query.posts.findFirst({
        where: eq(posts.id, postId),
        with: {
          author: {
            columns: { id: true, name: true, image: true, username: true },
          },
          postImages: {
            with: {
              image: { columns: { id: true, url: true } },
            },
            columns: { imageId: true },
          },
          parentPost: {
            // Fetch parentPost details
            columns: { id: true, title: true },
            with: {
              author: {
                // And its author
                columns: { id: true, username: true, name: true },
              },
            },
          },
        },
      })) as PostQueryResult | undefined

      if (!postData) {
        return c.json({ error: 'Post not found' }, 404)
      }

      if (
        postData.visibility === 'private' &&
        (!user || user.id !== postData.authorId)
      ) {
        return c.json(
          { error: 'Forbidden: You do not have permission to view this post' },
          403,
        )
      }

      let isLikedByCurrentUser = false
      if (user?.id) {
        const likeRecord = await db.query.likes.findFirst({
          where: and(eq(likes.postId, postId), eq(likes.userId, user.id)),
          columns: { userId: true },
        })
        isLikedByCurrentUser = !!likeRecord
      }

      const responseData = {
        ...postData,
        images: postData.postImages.map((pi) => pi.image).filter(Boolean),
        isLiked: isLikedByCurrentUser,
      }

      return c.json(responseData, 200)
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json(
          { error: 'Invalid Post ID format', details: error.flatten() },
          400,
        )
      }
      console.error('Error fetching post:', error)
      const errorMessage =
        error instanceof Error ? error.message : 'Internal server error'
      return c.json(
        { error: 'Failed to fetch post', details: errorMessage },
        500,
      )
    }
  },
)

// POST /api/posts/:postId/like - Like or unlike a post
postRoutes.post(
  '/:postId/like',
  requireAuthMiddleware,
  // Keep zValidator for early exit on bad format, but parse manually
  zValidator('param', postIdParamSchema, (result, c) => {
    if (!result.success) {
      // Use HTTPException for standard error handling
      throw new HTTPException(400, {
        message: 'Invalid Post ID format',
        cause: result.error,
      })
    }
  }),
  async (c: Context<PostRoutesAppEnv>) => {
    const user = c.get('user')
    // Check user again for type safety, though middleware should guarantee it
    if (!user || !user.id) {
      // This case should ideally not be reachable if requireAuthMiddleware works correctly
      console.error('User not found in context after requireAuthMiddleware')
      throw new HTTPException(401, { message: 'Authentication required' })
    }
    const userId = user.id // userId is now safely non-null

    let postId: number
    try {
      // Manual parse for param
      const params = postIdParamSchema.parse(c.req.param())
      postId = params.postId
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new HTTPException(400, {
          message: 'Invalid Post ID format',
          cause: error,
        })
      }
      throw error // Re-throw other unexpected errors
    }

    try {
      const result = await db.transaction(async (tx) => {
        // Check if the post exists first
        const postExists = await tx.query.posts.findFirst({
          where: eq(posts.id, postId),
          columns: { id: true },
        })
        if (!postExists) {
          throw new HTTPException(404, { message: 'Post not found' })
        }

        const existingLike = await tx.query.likes.findFirst({
          where: and(eq(likes.postId, postId), eq(likes.userId, userId)),
          columns: { userId: true },
        })

        let didLike: boolean
        let newLikeCount: number | null = null // Initialize to null

        if (existingLike) {
          // Unlike
          await tx
            .delete(likes)
            .where(and(eq(likes.postId, postId), eq(likes.userId, userId)))
          const updateResult = await tx
            .update(posts)
            .set({ likeCount: sql`GREATEST(0, ${posts.likeCount} - 1)` })
            .where(eq(posts.id, postId))
            .returning({ likeCount: posts.likeCount })
          newLikeCount = updateResult[0]?.likeCount ?? null
          didLike = false
          console.log(`User ${userId} unliked post ${postId}`)
        } else {
          // Like
          await tx.insert(likes).values({ postId: postId, userId: userId })
          const updateResult = await tx
            .update(posts)
            .set({ likeCount: sql`${posts.likeCount} + 1` })
            .where(eq(posts.id, postId))
            .returning({ likeCount: posts.likeCount })
          newLikeCount = updateResult[0]?.likeCount ?? null
          didLike = true
          console.log(`User ${userId} liked post ${postId}`)
        }
        // Ensure likeCount is a number or null, default to 0 if somehow undefined after update
        const finalLikeCount = newLikeCount === undefined ? 0 : newLikeCount
        return { didLike, likeCount: finalLikeCount }
      })
      // Return 200 OK with the result
      return c.json(result, 200)
    } catch (error) {
      // Re-throw HTTPException to be handled globally
      if (error instanceof HTTPException) {
        throw error
      }
      // Log other errors and return 500
      console.error(
        `Error liking/unliking post ${postId} for user ${userId}:`,
        error,
      )
      const errorMessage =
        error instanceof Error ? error.message : 'Internal server error'
      // Use HTTPException for consistency in error responses
      throw new HTTPException(500, {
        message: 'Failed to update like status',
        cause: error,
      })
    }
  },
)

// GET /api/posts/:postId/comments - Fetch comments for a post
postRoutes.get(
  '/:postId/comments',
  zValidator('param', postIdParamSchema, (result, c) => {
    if (!result.success) {
      throw new HTTPException(400, {
        message: 'Invalid Post ID format',
        cause: result.error,
      })
    }
  }),
  async (c: Context<PostRoutesAppEnv>) => {
    let postId: number
    try {
      const params = postIdParamSchema.parse(c.req.param())
      postId = params.postId
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new HTTPException(400, {
          message: 'Invalid Post ID format',
          cause: error,
        })
      }
      throw new HTTPException(400, { message: 'Invalid request parameter' })
    }

    try {
      // Fetch comments and assert the type for clearer access to relations
      const fetchedComments = (await db.query.comments.findMany({
        where: eq(commentsSchema.postId, postId), // Use explicit schema import
        with: {
          user: {
            // Correct relation name
            columns: { id: true, name: true, image: true, username: true },
          },
        },
        orderBy: [asc(commentsSchema.createdAt)], // Use explicit schema import
      })) as CommentWithUser[] // Assert the result type

      // Map to desired response structure (rename user to author)
      const commentsWithAuthor = fetchedComments.map((comment) => ({
        ...comment, // Spread basic comment fields
        author: comment.user, // Assign the nested user object to author
        user: undefined, // Remove the original user field from the final response
      }))

      // Remove the user field after mapping if it's not desired in the final output
      const finalResponse = commentsWithAuthor.map(({ user, ...rest }) => rest)

      return c.json(finalResponse, 200)
    } catch (error) {
      console.error(`Error fetching comments for post ${postId}:`, error)
      throw new HTTPException(500, { message: 'Failed to fetch comments' })
    }
  },
)

// GET /api/posts/:postId/clone - Get data for remixing a post
postRoutes.get(
  '/:postId/clone',
  requireAuthMiddleware, // Optional: decide if cloning requires auth
  zValidator('param', postIdParamSchema, (result, c) => {
    if (!result.success) {
      throw new HTTPException(400, {
        message: 'Invalid Post ID format',
        cause: result.error.flatten(),
      })
    }
  }),
  async (c) => {
    const { postId } = c.req.valid('param')

    try {
      const originalPost = await db.query.posts.findFirst({
        where: eq(posts.id, postId),
        columns: {
          id: true,
          title: true,
          tags: true,
          coverImg: true,
          rootPostId: true,
          generation: true,
          // Potentially include postImages relation if we want to suggest original images
        },
        // Example of how to include related images if needed:
        // with: {
        //   postImages: { columns: { imageId: true } }
        // }
      })

      if (!originalPost) {
        throw new HTTPException(404, { message: 'Original post not found' })
      }

      const cloneData: z.infer<typeof postCloneDataSchema> = {
        title: originalPost.title ? `Remix: ${originalPost.title}` : undefined,
        tags: originalPost.tags ?? undefined,
        coverImgUrl: originalPost.coverImg ?? undefined,
        parentPostId: originalPost.id,
        rootPostId: originalPost.rootPostId ?? originalPost.id, // If no root, original is the root
        generation: (originalPost.generation ?? 0) + 1,
        // imageIds: originalPost.postImages?.map(pi => pi.imageId) // If fetching postImages
      }

      return c.json(cloneData)
    } catch (error) {
      if (error instanceof HTTPException) throw error
      console.error(`Error cloning post ${postId}:`, error)
      throw new HTTPException(500, {
        message: 'Failed to get post data for cloning',
      })
    }
  },
)

// Zod schema for updating a post
const updatePostSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255).optional(),
  description: z.string().max(10000).optional().nullable(), // Corresponds to bodyMd
  tags: z.array(z.string().max(50)).max(10).optional().nullable(),
  visibility: z.enum(visibilityEnum.enumValues).optional(),
  // imageIds and coverImg are not typically updated here, that might be a separate flow
  // or a more complex update if cover image derived from imageIds changes.
})

// PATCH /api/posts/:postId - Update a post
postRoutes.patch(
  '/:postId',
  requireAuthMiddleware,
  zValidator('param', postIdParamSchema, (result, c) => {
    if (!result.success) {
      throw new HTTPException(400, {
        message: 'Invalid Post ID format',
        cause: result.error.flatten(),
      })
    }
  }),
  zValidator('json', updatePostSchema, (result, c) => {
    if (!result.success) {
      throw new HTTPException(400, {
        message: 'Invalid update data format',
        cause: result.error.flatten(),
      })
    }
  }),
  async (c) => {
    const user = c.get('user')
    if (!user || !user.id) {
      throw new HTTPException(401, { message: 'Authentication required' })
    }
    const userId = user.id
    const { postId } = c.req.valid('param')
    const updatePayload = c.req.valid('json')

    if (Object.keys(updatePayload).length === 0) {
      throw new HTTPException(400, { message: 'No update data provided.' })
    }

    try {
      const postToUpdate = await db.query.posts.findFirst({
        where: eq(posts.id, postId),
        columns: { id: true, authorId: true, visibility: true },
      })

      if (!postToUpdate) {
        throw new HTTPException(404, { message: 'Post not found' })
      }

      if (postToUpdate.authorId !== userId) {
        throw new HTTPException(403, {
          message: 'Forbidden: You do not have permission to update this post',
        })
      }

      const updateData: {
        title?: string
        bodyMd?: string | null
        tags?: string[] | null
        visibility?: 'public' | 'private'
        updatedAt?: Date // For manual timestamp update
      } = {}

      if (updatePayload.title !== undefined)
        updateData.title = updatePayload.title
      if (updatePayload.description !== undefined)
        updateData.bodyMd = updatePayload.description // map description to bodyMd
      if (updatePayload.tags !== undefined) updateData.tags = updatePayload.tags
      if (updatePayload.visibility !== undefined)
        updateData.visibility = updatePayload.visibility

      // Only set updatedAt if there are actual fields to update
      if (Object.keys(updateData).length > 0) {
        updateData.updatedAt = new Date()
      }

      // Store the original visibility before update for comparison later
      const originalVisibility = postToUpdate.visibility

      const [updatedPostResult] = await db
        .update(posts)
        .set(updateData)
        .where(eq(posts.id, postId))
        .returning() // Return all fields of the updated post

      if (!updatedPostResult) {
        // Should not happen if ownership check passed and post existed
        throw new HTTPException(500, {
          message: 'Failed to update post after verification.',
        })
      }

      // If visibility was part of the payload and it actually changed
      if (
        updatePayload.visibility &&
        updatedPostResult.visibility !== originalVisibility
      ) {
        const associatedPostImages = await db.query.postImages.findMany({
          where: eq(postImages.postId, postId),
          columns: { imageId: true },
        })
        const imageIdsToUpdate = associatedPostImages.map((pi) => pi.imageId)

        if (imageIdsToUpdate.length > 0) {
          await db
            .update(images)
            .set({ isPublic: updatedPostResult.visibility === 'public' })
            .where(sql`${images.id} IN ${imageIdsToUpdate}`)
        }
      }

      return c.json(updatedPostResult) // Use the result from the update operation
    } catch (error) {
      if (error instanceof HTTPException) throw error
      console.error(`Error updating post ${postId} by user ${userId}:`, error)
      throw new HTTPException(500, { message: 'Failed to update post' })
    }
  },
)

// DELETE /api/posts/:postId - Delete a post
postRoutes.delete(
  '/:postId',
  requireAuthMiddleware,
  zValidator('param', postIdParamSchema, (result, c) => {
    if (!result.success) {
      throw new HTTPException(400, {
        message: 'Invalid Post ID format',
        cause: result.error.flatten(),
      })
    }
  }),
  async (c) => {
    const user = c.get('user')
    if (!user || !user.id) {
      throw new HTTPException(401, { message: 'Authentication required' })
    }
    const userId = user.id
    const { postId } = c.req.valid('param')

    try {
      const postToDelete = await db.query.posts.findFirst({
        where: eq(posts.id, postId),
        columns: { id: true, authorId: true },
      })

      if (!postToDelete) {
        throw new HTTPException(404, { message: 'Post not found' })
      }

      if (postToDelete.authorId !== userId) {
        throw new HTTPException(403, {
          message: 'Forbidden: You do not have permission to delete this post',
        })
      }

      await db.delete(posts).where(eq(posts.id, postId))

      return c.json(
        { success: true, message: 'Post deleted successfully' },
        200,
      )
    } catch (error) {
      if (error instanceof HTTPException) throw error
      console.error(`Error deleting post ${postId} by user ${userId}:`, error)
      throw new HTTPException(500, { message: 'Failed to delete post' })
    }
  },
)

export default postRoutes
