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

        // 3. Handle VE grant for public post
        if (payload.visibility === 'public') {
          const veGrantPublic = 2
          await tx
            .update(users)
            .set({ vibe_energy: sql`${users.vibe_energy} + ${veGrantPublic}` })
            .where(eq(users.id, userId))

          await tx.insert(veTxns).values({
            userId: userId,
            delta: veGrantPublic,
            reason: 'Published public post',
            refId: postId,
          })
        }

        // 4. Handle Remix-specific updates (if parentPostId is provided)
        if (payload.parentPostId) {
          // Find the parent post author ID
          const parentPost = await tx.query.posts.findFirst({
            where: eq(posts.id, payload.parentPostId),
            columns: { authorId: true },
          })
          if (!parentPost || !parentPost.authorId) {
            // Throw error or handle case where parent post/author is missing
            console.warn(
              `Parent post ${payload.parentPostId} or its author not found during remix processing.`,
            )
            // Depending on desired behavior, you might throw an error here to rollback
            // throw new Error(`Parent post ${payload.parentPostId} not found`);
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
              reason: 'Remix source', // Or 'Work Remixed'
              refId: payload.parentPostId, // Link to the parent post
            })
            // Optional: Record VE transaction for the remixer (if any cost/reward)
            // await tx.insert(veTxns).values({ userId: userId, delta: 0, reason: 'Remixed post', refId: postId });
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
            columns: { id: true, name: true, image: true },
          },
          postImages: {
            with: {
              image: {
                columns: { id: true, url: true },
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
        id: postData.id,
        title: postData.title,
        description: postData.bodyMd, // Map bodyMd to description
        tags: postData.tags,
        visibility: postData.visibility,
        coverImg: postData.coverImg, // Changed back to coverImg
        createdAt: postData.createdAt?.toISOString(), // Ensure date is ISO string, used optional chain
        authorId: postData.authorId,
        likeCount: postData.likeCount,
        commentCount: postData.commentCount,
        remixCount: postData.remixCount,
        viewCount: postData.viewCount, // Ensure viewCount is included
        parentPostId: postData.parentPostId,
        rootPostId: postData.rootPostId,
        generation: postData.generation,
        author: postData.author,
        images: postData.postImages
          .map((pi) => pi.image)
          .filter((img) => img != null) as Array<{ id: number; url: string }>,
        isLiked: isLikedByCurrentUser, // Add isLiked field
        // viewCount will be added in a subsequent step
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
            columns: { id: true, name: true, image: true },
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

// GET /api/posts/:postId/clone - Get information to clone/remix a post
postRoutes.get(
  '/:postId/clone',
  requireAuthMiddleware,
  zValidator('param', postIdParamSchema, (result, c) => {
    if (!result.success) {
      throw new HTTPException(400, {
        message: 'Invalid Post ID format',
        cause: result.error,
      })
    }
  }),
  async (c: Context<PostRoutesAppEnv>) => {
    const user = c.get('user')
    if (!user || !user.id) {
      // Should be caught by requireAuthMiddleware, but as a safeguard
      throw new HTTPException(401, { message: 'Authentication required' })
    }

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
      // For other unexpected errors during param parsing
      throw new HTTPException(400, { message: 'Invalid request parameters' })
    }

    try {
      // 1. Fetch the source post
      const sourcePost = await db.query.posts.findFirst({
        where: eq(posts.id, postId),
        columns: {
          id: true,
          coverImg: true,
          parentPostId: true,
          rootPostId: true,
          generation: true,
          visibility: true,
          // Potentially authorId if we need to check ownership for non-public posts, though remixing usually implies public.
        },
      })

      if (!sourcePost) {
        throw new HTTPException(404, { message: 'Source post not found' })
      }

      // For now, let's assume only public posts can be remixed.
      // This can be adjusted based on product requirements.
      if (sourcePost.visibility !== 'public') {
        throw new HTTPException(403, {
          message: 'Only public posts can be remixed',
        })
      }

      // 2. Find prompt and model for the cover image
      let imagePrompt: string | null = null
      let imageModel: string | null = null

      if (sourcePost.coverImg) {
        const coverImageDetails = await db.query.images.findFirst({
          where: eq(images.url, sourcePost.coverImg),
          columns: { prompt: true, model: true },
        })
        if (coverImageDetails) {
          imagePrompt = coverImageDetails.prompt
          imageModel = coverImageDetails.model
        }
      }

      // 3. Determine rootPostId and generation
      const parentPostIdForRemix = sourcePost.id
      const rootPostIdForRemix = sourcePost.rootPostId ?? sourcePost.id // If no root, this is the root
      const currentGeneration = sourcePost.generation ?? 0 // Assume 0 if null
      const nextGeneration = currentGeneration + 1

      const cloneInfo = {
        prompt: imagePrompt,
        model: imageModel,
        parentPostId: parentPostIdForRemix,
        rootPostId: rootPostIdForRemix,
        generation: nextGeneration,
      }

      return c.json(cloneInfo, 200)
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error // Re-throw known HTTP errors
      }
      console.error(`Error fetching post clone info for post ${postId}:`, error)
      throw new HTTPException(500, {
        message: 'Failed to fetch post clone information',
      })
    }
  },
)

export default postRoutes
