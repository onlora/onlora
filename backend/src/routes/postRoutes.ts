import { zValidator } from '@hono/zod-validator'
import { and, asc, eq, sql } from 'drizzle-orm'
import { type Context, Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { db } from '../db' // Adjust path as needed
import {
  bookmarks,
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
  optionalAuthMiddleware,
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

// Define a type for individual tree nodes
interface RemixNodeSelf {
  id: number
  title: string | null
  author: {
    id: string
    username: string | null
    name: string | null
    image: string | null
  } | null
  parentId: number | null
  coverImg: string | null
  createdAt: string | null // Expect ISO string or null
  remixes: RemixNodeSelf[]
}

const RemixTreeNodeSchema: z.ZodType<RemixNodeSelf> = z.lazy(() =>
  z.object({
    id: z.number(),
    title: z.string().nullable(),
    author: z
      .object({
        id: z.string(),
        username: z.string().nullable(),
        name: z.string().nullable(),
        image: z.string().nullable(),
      })
      .nullable(),
    parentId: z.number().nullable(),
    coverImg: z.string().nullable(),
    createdAt: z.string().nullable(), // Expect ISO string or null
    remixes: z.array(RemixTreeNodeSchema),
  }),
)

// Define the overall API response schema
const RemixTreeResponseSchema = z.object({
  currentPostId: z.number(),
  lineage: z.array(RemixTreeNodeSchema),
  tree: RemixTreeNodeSchema,
})

// Define the specific Environment for this router
interface PostRoutesAppEnv extends AuthenticatedContextEnv {
  Variables: AuthenticatedContextEnv['Variables'] // Explicitly carry over Variables
  ValidatedData: {
    param: z.infer<typeof postIdParamSchema>
    json: z.infer<typeof createPostSchema> | z.infer<typeof updatePostSchema> // Union of possible JSON schemas
    // Add other validation types like 'query' if used
  }
}

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
    name: string | null
    image: string | null
  } | null
  postImages: Array<{
    id: number // id of the post_images record
    // postId: number // Redundant as it's part of the main post
    imageId: number // id of the actual image
    // createdAt: Date | null // Timestamp of the post_images record
    image: {
      id: number
      url: string
      // We could add prompt, model from images table if needed here
    } | null // The actual image object from the images table
  }>
  parentPost?: {
    id: number
    title: string | null
    author: {
      id: string
      username: string
      name: string | null
    } | null
  } | null
  bookmarkCount: number | null
  isLiked?: boolean
  isBookmarked?: boolean
  // This will be the transformed array of actual image objects for the client
  imagesForClient?: Array<{ id: number; url: string }>
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

// GET /api/posts/:postId - Get details for a single post
postRoutes.get(
  '/:postId',
  optionalAuthMiddleware,
  zValidator('param', postIdParamSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: 'Invalid post ID format' }, 400)
    }
  }),
  async (c) => {
    const { postId } = c.req.valid('param')
    const currentUser = c.get('user')

    try {
      // Atomically increment view_count using SQL
      // Note: .returning() might not be directly supported in all simple update scenarios or without specific driver features.
      // We will fetch the post separately after updating.
      await db
        .update(posts)
        .set({ viewCount: sql`${posts.viewCount} + 1` })
        .where(eq(posts.id, postId))

      // Fetch the post with all relations
      const postData = (await db.query.posts.findFirst({
        where: eq(posts.id, postId),
        with: {
          author: {
            columns: {
              id: true,
              username: true,
              name: true,
              image: true,
            },
          },
          postImages: {
            with: {
              image: {
                // This is the image object from the 'images' table
                columns: { id: true, url: true },
              },
            },
            // Select from 'post_images' join table
            columns: { id: true, imageId: true },
          },
          parentPost: {
            columns: { id: true, title: true },
            with: {
              author: {
                columns: { id: true, username: true, name: true },
              },
            },
          },
        },
        // Explicitly list all columns from the posts table we need
        columns: {
          id: true,
          title: true,
          bodyMd: true,
          tags: true,
          visibility: true,
          coverImg: true,
          authorId: true,
          createdAt: true,
          likeCount: true,
          commentCount: true,
          remixCount: true,
          viewCount: true,
          parentPostId: true,
          rootPostId: true,
          generation: true,
          bookmarkCount: true,
        },
      })) as
        | Omit<PostQueryResult, 'isLiked' | 'isBookmarked' | 'imagesForClient'>
        | undefined
      // Cast to a version of PostQueryResult that doesn't yet have the client-specific fields

      if (!postData) {
        return c.json({ error: 'Post not found' }, 404)
      }

      let isLiked = false
      let isBookmarked = false
      if (currentUser?.id) {
        const likeRecord = await db.query.likes.findFirst({
          where: and(
            eq(likes.postId, postId),
            eq(likes.userId, currentUser.id),
          ),
          columns: { userId: true },
        })
        isLiked = !!likeRecord

        const bookmarkRecord = await db.query.bookmarks.findFirst({
          where: and(
            eq(bookmarks.postId, postId),
            eq(bookmarks.userId, currentUser.id),
          ),
          columns: { userId: true },
        })
        isBookmarked = !!bookmarkRecord
      }

      // Transform postImages to a cleaner array of image objects for the client
      const imagesForClient = (postData.postImages || [])
        .map((pi) => pi.image)
        .filter((img): img is { id: number; url: string } => img !== null)

      const response: PostQueryResult = {
        ...(postData as PostQueryResult),
        isLiked,
        isBookmarked,
        imagesForClient,
      }
      // Remove the original postImages from the response if it's verbose or not needed by client
      // delete (response as any).postImages;

      return c.json(response)
    } catch (error) {
      console.error(`Error fetching post ${postId}:`, error)
      if (error instanceof HTTPException) throw error
      return c.json({ error: 'Failed to fetch post details' }, 500)
    }
  },
)

// POST /api/posts/:postId/like - Like or unlike a post
postRoutes.post(
  '/:postId/like',
  requireAuthMiddleware,
  zValidator('param', postIdParamSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: 'Invalid post ID format' }, 400)
    }
  }),
  async (c) => {
    const user = c.get('user')
    if (!user) return c.json({ error: 'User not authenticated' }, 401) // Should be caught by middleware anyway
    const userId = user.id

    const { postId } = c.req.valid('param')

    try {
      const result = await db.transaction(async (tx) => {
        const postExists = await tx.query.posts.findFirst({
          where: eq(posts.id, postId),
          columns: { id: true, likeCount: true },
        })

        if (!postExists) {
          throw new HTTPException(404, { message: 'Post not found' })
        }

        const existingLike = await tx.query.likes.findFirst({
          where: and(eq(likes.postId, postId), eq(likes.userId, userId)),
        })

        let liked: boolean
        let currentLikeCount: number = postExists.likeCount ?? 0

        if (existingLike) {
          // Unlike
          await tx
            .delete(likes)
            .where(and(eq(likes.postId, postId), eq(likes.userId, userId)))
          await tx
            .update(posts)
            .set({ likeCount: sql`GREATEST(0, ${posts.likeCount} - 1)` })
            .where(eq(posts.id, postId))
          liked = false
          currentLikeCount = Math.max(0, currentLikeCount - 1)
        } else {
          // Like
          await tx
            .insert(likes)
            .values({ postId, userId, createdAt: new Date() })
          await tx
            .update(posts)
            .set({ likeCount: sql`${posts.likeCount} + 1` })
            .where(eq(posts.id, postId))
          liked = true
          currentLikeCount = currentLikeCount + 1
        }
        return { liked, likeCount: currentLikeCount }
      })
      return c.json(result)
    } catch (error) {
      if (error instanceof HTTPException) throw error
      console.error('Error liking/unliking post:', error)
      return c.json({ error: 'Failed to update like status' }, 500)
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

// POST /api/posts/:postId/bookmark - Bookmark or unbookmark a post
postRoutes.post(
  '/:postId/bookmark',
  requireAuthMiddleware,
  zValidator('param', postIdParamSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: 'Invalid post ID format' }, 400)
    }
  }),
  async (c) => {
    const user = c.get('user')
    if (!user?.id) return c.json({ error: 'User not authenticated' }, 401)
    const userId = user.id
    const { postId } = c.req.valid('param')

    try {
      const result = await db.transaction(async (tx) => {
        const post = await tx.query.posts.findFirst({
          where: eq(posts.id, postId),
          columns: { id: true, bookmarkCount: true },
        })

        if (!post) {
          throw new HTTPException(404, { message: 'Post not found' })
        }

        const existingBookmark = await tx.query.bookmarks.findFirst({
          where: and(
            eq(bookmarks.postId, postId),
            eq(bookmarks.userId, userId),
          ),
        })

        let currentBookmarkCount = post.bookmarkCount ?? 0

        if (existingBookmark) {
          return { bookmarked: true, bookmarkCount: currentBookmarkCount }
        }

        await tx
          .insert(bookmarks)
          .values({ postId, userId, createdAt: new Date() })
        await tx
          .update(posts)
          .set({ bookmarkCount: sql`${posts.bookmarkCount} + 1` })
          .where(eq(posts.id, postId))

        currentBookmarkCount++
        return { bookmarked: true, bookmarkCount: currentBookmarkCount }
      })
      return c.json(result)
    } catch (error) {
      if (error instanceof HTTPException) throw error
      console.error('Error bookmarking post:', error)
      return c.json({ error: 'Failed to bookmark post' }, 500)
    }
  },
)

// DELETE /api/posts/:postId/bookmark - Unbookmark a post
postRoutes.delete(
  '/:postId/bookmark',
  requireAuthMiddleware,
  zValidator('param', postIdParamSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: 'Invalid post ID format' }, 400)
    }
  }),
  async (c) => {
    const user = c.get('user')
    if (!user) return c.json({ error: 'User not authenticated' }, 401)
    const userId = user.id
    const { postId } = c.req.valid('param')

    try {
      const result = await db.transaction(async (tx) => {
        const post = await tx.query.posts.findFirst({
          where: eq(posts.id, postId),
          columns: { id: true, bookmarkCount: true },
        })

        if (!post) {
          // Post not found, but if user is trying to unbookmark, it implies it might have existed.
          // Or, if it never existed, no bookmark could exist. Consider current behavior sufficient.
          throw new HTTPException(404, { message: 'Post not found' })
        }

        const existingBookmark = await tx.query.bookmarks.findFirst({
          where: and(
            eq(bookmarks.postId, postId),
            eq(bookmarks.userId, userId),
          ),
        })

        let currentBookmarkCount = post.bookmarkCount ?? 0

        if (!existingBookmark) {
          // Not bookmarked, do nothing, return current state
          return { bookmarked: false, bookmarkCount: currentBookmarkCount }
        }

        // Remove bookmark
        await tx
          .delete(bookmarks)
          .where(
            and(eq(bookmarks.postId, postId), eq(bookmarks.userId, userId)),
          )

        // Use increment with negative value for decrement, ensuring it doesn't go below 0 via GREATEST or similar logic if needed
        // For now, direct decrement. Drizzle's increment(column, -1) should handle this.
        // Or more explicitly: sql`GREATEST(0, ${posts.bookmarkCount} - 1)`
        await tx
          .update(posts)
          .set({ bookmarkCount: sql`GREATEST(0, ${posts.bookmarkCount} - 1)` })
          .where(eq(posts.id, postId))

        currentBookmarkCount = Math.max(0, currentBookmarkCount - 1)
        return { bookmarked: false, bookmarkCount: currentBookmarkCount }
      })
      return c.json(result)
    } catch (error) {
      if (error instanceof HTTPException) throw error
      console.error('Error unbookmarking post:', error)
      return c.json({ error: 'Failed to unbookmark post' }, 500)
    }
  },
)

// GET /api/posts/:postId/remix-tree - Get remix tree for a post
postRoutes.get(
  '/:postId/remix-tree',
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
    const { postId } = c.req.valid('param')

    try {
      type FetchedPostNode = {
        id: number
        title: string | null
        parentId: number | null // This will be mapped from parentPostId
        coverImg: string | null
        createdAt: Date | null // Date from DB
        author: {
          id: string
          username: string | null
          name: string | null
          image: string | null
        } | null
      }

      const fetchPostNodeData = async (
        pId: number,
      ): Promise<FetchedPostNode | null> => {
        const post = await db.query.posts.findFirst({
          where: eq(posts.id, pId),
          columns: {
            id: true,
            title: true,
            parentPostId: true, // Correct schema field name
            coverImg: true,
            createdAt: true,
            // authorId is implicitly handled by the 'author' relation in 'with'
          },
          with: {
            author: {
              columns: { id: true, username: true, name: true, image: true },
            },
          },
        })

        if (!post) return null

        return {
          id: post.id,
          title: post.title,
          parentId: post.parentPostId, // Map from the correct schema field
          coverImg: post.coverImg,
          createdAt: post.createdAt,
          author: post.author, // Access the nested author object from the 'with' clause
        }
      }

      const lineage: RemixNodeSelf[] = []
      const currentPostDataForLineage = await db.query.posts.findFirst({
        where: eq(posts.id, postId),
        columns: { parentPostId: true }, // Use schema field name
      })
      let currentAncestorId = currentPostDataForLineage?.parentPostId

      while (currentAncestorId) {
        const ancestorData = await fetchPostNodeData(currentAncestorId)
        if (ancestorData) {
          lineage.unshift({
            id: ancestorData.id,
            title: ancestorData.title,
            author: ancestorData.author,
            parentId: ancestorData.parentId, // This should now be correct from FetchedPostNode
            coverImg: ancestorData.coverImg,
            createdAt: ancestorData.createdAt?.toISOString() ?? null,
            remixes: [],
          })
          currentAncestorId = ancestorData.parentId
        } else {
          currentAncestorId = null
        }
      }

      const buildRemixTree = async (
        pId: number,
      ): Promise<RemixNodeSelf | null> => {
        const nodeData = await fetchPostNodeData(pId)
        if (!nodeData) return null

        const childrenRecords = await db.query.posts.findMany({
          where: eq(posts.parentPostId, pId), // Use correct schema field parentPostId for querying children
          columns: { id: true },
        })

        const remixes: RemixNodeSelf[] = []
        for (const childRecord of childrenRecords) {
          const childTree = await buildRemixTree(childRecord.id)
          if (childTree) {
            remixes.push(childTree)
          }
        }
        return {
          id: nodeData.id,
          title: nodeData.title,
          author: nodeData.author,
          parentId: nodeData.parentId, // Correct from FetchedPostNode
          coverImg: nodeData.coverImg,
          createdAt: nodeData.createdAt?.toISOString() ?? null,
          remixes: remixes,
        }
      }

      const tree = await buildRemixTree(postId)

      if (!tree) {
        throw new HTTPException(404, {
          message: 'Post not found or tree could not be built',
        })
      }

      const response = {
        currentPostId: postId,
        lineage: lineage,
        tree: tree,
      }

      // Attempt to parse with Zod to ensure conformity, good for debugging
      // This will throw if the structure is wrong, which is helpful.
      // const validatedResponse = RemixTreeResponseSchema.parse(response);
      // return c.json(validatedResponse);
      return c.json(response)
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Catch Zod validation errors
        console.error(
          `Zod validation error for remix tree, post ${postId}:`,
          error.flatten(),
        )
        throw new HTTPException(500, {
          message: 'Internal server error: Remix tree data validation failed',
          cause: error.flatten(),
        })
      }
      if (error instanceof HTTPException) throw error
      console.error(`Error fetching remix tree for post ${postId}:`, error)
      throw new HTTPException(500, { message: 'Failed to fetch remix tree' })
    }
  },
)

export default postRoutes
