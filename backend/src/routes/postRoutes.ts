import { randomUUID } from 'node:crypto' // For generating UUIDs
import { zValidator } from '@hono/zod-validator'
import type { Resource } from '@lens-chain/storage-client'
import { MediaImageMimeType, image, textOnly } from '@lens-protocol/metadata'
import { and, eq, sql } from 'drizzle-orm'
import { type Context, Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { db } from '../db' // Adjust path as needed
import {
  bookmarks,
  follows,
  images,
  lensAccounts,
  lensPosts,
  likes,
  postImages,
  posts,
  users,
  veTxns,
  visibilityEnum,
} from '../db/schema'
import {
  getImmutableAcl,
  lensGroveStorageClient,
} from '../lib/lens-grove-storage'
import { uploadBufferToR2 } from '../lib/r2' // Import R2 upload function
import {
  type AuthenticatedContextEnv,
  optionalAuthMiddleware,
  requireAuthMiddleware,
} from '../middleware/auth' // Changed to AuthenticatedContextEnv
import {
  createComment,
  createCommentSchema,
  getCommentsByPostId,
} from '../services/commentService' // Import from service

// Constants
const ONLORA_LENS_APP_ID = '0x46E8f06e085f68864Ef5616c9f5dEB514a7fd617'

// UUID validation pattern
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Define type for image data
interface ImageData {
  id?: string
  data: string // base64 data or URL
  altText?: string
}

// Zod schema for post creation payload with direct image data
const createPostSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().max(10000).optional(), // Corresponds to bodyMd
  tags: z.array(z.string().max(50)).max(10).optional().default([]),
  visibility: z.enum(visibilityEnum.enumValues), // Use the enum from schema
  images: z
    .array(
      z.object({
        id: z.string().optional(), // Optional ID if exists
        data: z.string(), // base64 data or URL
        altText: z.string().optional(),
      }),
    )
    .min(1, 'At least one image is required')
    .max(10),
  jamId: z
    .string()
    .regex(uuidPattern, 'Jam ID must be a valid UUID')
    .optional(), // Optional: to link post back to its origin jam
  // Remix-specific fields (optional)
  parentPostId: z
    .string()
    .regex(uuidPattern, 'Parent Post ID must be a valid UUID')
    .optional(),
  rootPostId: z
    .string()
    .regex(uuidPattern, 'Root Post ID must be a valid UUID')
    .optional(),
  generation: z.number().int().nonnegative().optional(),
})

// Define the specific type for the validated data from this schema
// This helps in typing the payload explicitly if needed, or for inference.
type CreatePostValidatedData = z.infer<typeof createPostSchema>

// Zod schema for postId param
const postIdParamSchema = z.object({
  postId: z.string().regex(uuidPattern, 'Post ID must be a valid UUID'),
})

// --- Zod schema for the response of the clone endpoint ---
const postCloneDataSchema = z.object({
  title: z.string().optional(), // e.g., "Remix: Original Title"
  tags: z.array(z.string()).optional(),
  coverImgUrl: z.string().url().optional(),
  // imageIds: z.array(z.string().regex(uuidPattern)).optional(), // If we decide to clone image associations by ID
  parentPostId: z
    .string()
    .regex(uuidPattern, 'Parent Post ID must be a valid UUID'),
  rootPostId: z
    .string()
    .regex(uuidPattern, 'Root Post ID must be a valid UUID'),
  generation: z.number().int().nonnegative(),
  // Potentially a snippet of bodyMd if desired
})

// Define a type for individual tree nodes
interface RemixNodeSelf {
  id: string
  title: string | null
  author: {
    id: string
    username: string | null
    name: string | null
    image: string | null
  } | null
  parentId: string | null
  coverImg: string | null
  createdAt: string | null // Expect ISO string or null
  remixes: RemixNodeSelf[]
}

const RemixTreeNodeSchema: z.ZodType<RemixNodeSelf> = z.lazy(() =>
  z.object({
    id: z.string(),
    title: z.string().nullable(),
    author: z
      .object({
        id: z.string(),
        username: z.string().nullable(),
        name: z.string().nullable(),
        image: z.string().nullable(),
      })
      .nullable(),
    parentId: z.string().nullable(),
    coverImg: z.string().nullable(),
    createdAt: z.string().nullable(), // Expect ISO string or null
    remixes: z.array(RemixTreeNodeSchema),
  }),
)

// Define the overall API response schema
const RemixTreeResponseSchema = z.object({
  currentPostId: z.string(),
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
  id: string
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
  parentPostId: string | null
  rootPostId: string | null
  generation: number | null
  author: {
    id: string
    username: string
    name: string | null
    image: string | null
    isFollowing?: boolean
  } | null
  postImages: Array<{
    id: string // id of the post_images record
    // postId: number // Redundant as it's part of the main post
    imageId: string // id of the actual image
    // createdAt: Date | null // Timestamp of the post_images record
    image: {
      id: string
      url: string
      // We could add prompt, model from images table if needed here
    } | null // The actual image object from the images table
  }>
  parentPost?: {
    id: string
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
  imagesForClient?: Array<{ id: string; url: string }>
}

// --- Helper Type for Comment Query Result ---
// Manually define the expected shape of a comment with its user relation
interface CommentWithUser {
  id: string
  postId: string
  userId: string | null
  parentId: string | null
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

// Process image data and upload to R2 if needed
async function processImage(
  imageData: ImageData,
): Promise<{ id: string; url: string } | null> {
  try {
    // Generate random ID if not provided
    const imageId = imageData.id || randomUUID()

    // If image already exists in our database, return its URL instead of uploading again
    if (imageData.id) {
      const existingImage = await db.query.images.findFirst({
        where: eq(images.id, imageId),
        columns: { url: true },
      })

      if (existingImage) {
        console.log(
          `Image ${imageId} already exists, reusing URL: ${existingImage.url}`,
        )
        return {
          id: imageId,
          url: existingImage.url,
        }
      }
    }

    // If it's a base64 image, upload to R2
    if (imageData.data.startsWith('data:image/')) {
      // Extract image data and MIME type
      const matches = imageData.data.match(/^data:([A-Za-z-+/]+);base64,(.+)$/)

      if (!matches || matches.length !== 3) {
        console.error('Invalid base64 format for image')
        return null
      }

      const contentType = matches[1]
      const base64Data = matches[2]
      const imageBuffer = Buffer.from(base64Data, 'base64')

      // Upload to R2
      const r2Result = await uploadBufferToR2(
        imageBuffer,
        contentType,
        `${imageId}.${contentType.split('/')[1] || 'png'}`,
      )

      if (!r2Result?.publicUrl) {
        console.error('Failed to upload image to R2')
        return null
      }

      return {
        id: imageId,
        url: r2Result.publicUrl,
      }
    }

    // If it's already a URL, just use it directly
    return {
      id: imageId,
      url: imageData.data,
    }
  } catch (error) {
    console.error('Error processing image:', error)
    return null
  }
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

      // Process the provided images
      const processedImages: Array<{ id: string; url: string }> = []
      for (const imageData of payload.images) {
        const result = await processImage(imageData)
        if (result) {
          processedImages.push(result)
        }
      }

      if (processedImages.length === 0) {
        return c.json(
          {
            error: 'No valid images processed',
            details: 'Could not process any of the provided images',
          },
          400,
        )
      }

      // Use the first processed image as the cover
      const coverImage = processedImages[0]
      const coverImgUrl = coverImage.url

      const result = await db.transaction(async (tx) => {
        // Track successfully processed image IDs to link with post
        const processedImageIds: string[] = []

        // Store all processed images in the images table using upsert
        for (const img of processedImages) {
          // Use onConflictDoNothing to gracefully handle existing images
          await tx
            .insert(images)
            .values({
              id: img.id,
              url: img.url,
              jamId: payload.jamId,
              isPublic: payload.visibility === 'public',
              prompt:
                payload.images.find((i) => i.id === img.id)?.altText ||
                payload.title,
              createdAt: new Date(),
            })
            .onConflictDoNothing({ target: images.id })

          // Always add to our list to link with the post
          processedImageIds.push(img.id)
        }

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
            jamId: payload.jamId,
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

        // 2. Link images to the post - use our tracked processedImageIds
        // which includes both newly inserted and existing images
        const postImageEntries = processedImageIds.map((imgId) => ({
          postId: postId,
          imageId: imgId,
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

        // Check if current user is following the post author
        if (postData.author && postData.author.id !== currentUser.id) {
          const followRecord = await db.query.follows.findFirst({
            where: and(
              eq(follows.followerId, currentUser.id),
              eq(follows.followingId, postData.author.id),
            ),
            columns: { followerId: true },
          })

          // Add isFollowing to the author object
          postData.author = {
            ...postData.author,
            isFollowing: !!followRecord,
          }
        }
      }

      // Transform postImages to a cleaner array of image objects for the client
      const imagesForClient = (postData.postImages || [])
        .map((pi) => pi.image)
        .filter((img): img is { id: string; url: string } => img !== null)

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
  optionalAuthMiddleware, // Make this optional auth so we can get the user ID if present
  zValidator('param', postIdParamSchema, (result, c) => {
    if (!result.success) {
      throw new HTTPException(400, {
        message: 'Invalid Post ID format',
        cause: result.error,
      })
    }
  }),
  async (c: Context<PostRoutesAppEnv>) => {
    let postId: string
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
      // Get current user ID if authenticated
      const currentUser = c.get('user')
      const currentUserId = currentUser?.id

      // Use the service function and pass currentUserId
      const comments = await getCommentsByPostId(postId, currentUserId)

      return c.json(comments, 200)
    } catch (error) {
      console.error(`Error fetching comments for post ${postId}:`, error)
      throw new HTTPException(500, { message: 'Failed to fetch comments' })
    }
  },
)

// POST /api/posts/:postId/comments - Add a comment to a post
postRoutes.post(
  '/:postId/comments',
  requireAuthMiddleware,
  zValidator('param', postIdParamSchema),
  async (c) => {
    const user = c.get('user')
    if (!user || !user.id) {
      return c.json({ error: 'Authentication required' }, 401)
    }
    const userId = user.id

    try {
      const { postId } = c.req.valid('param')

      // Get the JSON payload from the request
      const jsonPayload = await c.req.json()

      // Add the postId from the route parameter
      const commentPayload = {
        ...jsonPayload,
        postId,
      }

      // Validate the combined payload using the schema from commentRoutes
      const parsedPayload = createCommentSchema.parse(commentPayload)

      // Use the shared function from commentRoutes to handle all the comment creation logic
      const result = await createComment(parsedPayload, userId)

      return c.json(result)
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json(
          { error: 'Validation failed', details: error.flatten() },
          400,
        )
      }
      if (error instanceof HTTPException) {
        return c.json({ error: error.message }, error.status)
      }
      console.error('Error creating comment:', error)
      return c.json({ error: 'Failed to create comment' }, 500)
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
        id: string
        title: string | null
        parentId: string | null // This will be mapped from parentPostId
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
        pId: string,
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
        pId: string,
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

// POST /api/posts/create-and-link-lens - Link a post to Lens Protocol
const createAndLinkLensSchema = z.object({
  postId: z.string().regex(uuidPattern, 'Post ID must be a valid UUID'),
  lensPostId: z.string().min(1, 'Lens Post ID is required'),
  lensContentUri: z.string().min(1, 'Lens Content URI is required'),
  lensTransactionHash: z.string().min(1, 'Lens Transaction Hash is required'),
  lensAccountId: z.string().min(1, 'Lens Account ID is required'),
})

postRoutes.post(
  '/create-and-link-lens',
  requireAuthMiddleware,
  zValidator('json', createAndLinkLensSchema, (result, c) => {
    if (!result.success) {
      throw new HTTPException(400, {
        message: 'Invalid request data',
        cause: result.error.flatten(),
      })
    }
  }),
  async (c) => {
    const user = c.get('user')
    if (!user?.id) {
      throw new HTTPException(401, { message: 'Authentication required' })
    }

    try {
      const payload = c.req.valid('json')

      // Verify post ownership
      const post = await db.query.posts.findFirst({
        where: eq(posts.id, payload.postId),
        columns: { authorId: true },
      })

      if (!post) {
        throw new HTTPException(404, { message: 'Post not found' })
      }

      if (post.authorId !== user.id) {
        throw new HTTPException(403, {
          message: 'You do not have permission to link this post',
        })
      }

      // Verify lens account ownership
      console.log('payload.lensAccountId:', payload.lensAccountId)
      console.log('lensAccounts.address:', lensAccounts.address)
      const lensAccount = await db.query.lensAccounts.findFirst({
        where: eq(
          lensAccounts.address,
          sql`LOWER(${payload.lensAccountId})::text = LOWER(lens_accounts.address)::text`,
        ),
        columns: { userId: true, id: true },
      })

      if (!lensAccount) {
        throw new HTTPException(404, { message: 'Lens account not found' })
      }

      if (lensAccount.userId !== user.id) {
        throw new HTTPException(403, {
          message: 'You do not have permission to use this Lens account',
        })
      }

      // Create lens post record
      const result = await db.transaction(async (tx) => {
        const [lensPost] = await tx
          .insert(lensPosts)
          .values({
            postId: payload.postId,
            accountId: lensAccount.id, // Use the internal id
            lensPostId: payload.lensPostId,
            metadataUri: payload.lensContentUri,
            transactionHash: payload.lensTransactionHash,
            lensPublishedAt: new Date(),
          })
          .returning()

        return { success: true, lensPost }
      })

      return c.json(result)
    } catch (error) {
      if (error instanceof HTTPException) throw error
      console.error('Error linking post to Lens:', error)
      throw new HTTPException(500, { message: 'Failed to link post to Lens' })
    }
  },
)

// POST /api/posts/prepare-lens-metadata - Prepare metadata for Lens post
const prepareLensMetadataSchema = z.object({
  postId: z.string().regex(uuidPattern, 'Post ID must be a valid UUID'),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  images: z.array(
    z.object({
      data: z.string(), // base64 data or URL
      altText: z.string().optional(),
    }),
  ),
})

postRoutes.post(
  '/prepare-lens-metadata',
  requireAuthMiddleware,
  zValidator('json', prepareLensMetadataSchema, (result, c) => {
    if (!result.success) {
      throw new HTTPException(400, {
        message: 'Invalid request data',
        cause: result.error.flatten(),
      })
    }
  }),
  async (c) => {
    const user = c.get('user')
    if (!user?.id) {
      throw new HTTPException(401, { message: 'Authentication required' })
    }

    try {
      const payload = c.req.valid('json')

      // Verify post ownership
      const post = await db.query.posts.findFirst({
        where: eq(posts.id, payload.postId),
        columns: { authorId: true },
      })

      if (!post) {
        throw new HTTPException(404, { message: 'Post not found' })
      }

      if (post.authorId !== user.id) {
        throw new HTTPException(403, {
          message:
            'You do not have permission to prepare metadata for this post',
        })
      }

      // Get immutable ACL for Lens Grove
      const acl = getImmutableAcl()

      // Process images if any
      const hasImages = payload.images && payload.images.length > 0
      let contentUri = '' // Initialize with empty string

      if (hasImages) {
        // Process and prepare image files
        const imageFiles: File[] = []
        for (const imageData of payload.images) {
          // Process base64 image
          if (imageData.data.startsWith('data:image')) {
            const matches = imageData.data.match(
              /^data:([A-Za-z-+/]+);base64,(.+)$/,
            )
            if (!matches || matches.length !== 3) {
              continue
            }

            const contentType = matches[1]
            const base64Data = matches[2]
            const imageBuffer = Buffer.from(base64Data, 'base64')
            const extension = contentType.split('/')[1] || 'png'
            const filename = `lens-${Date.now()}.${extension}`

            // Create File object from buffer
            const blob = new Blob([imageBuffer], { type: contentType })
            const file = new File([blob], filename, { type: contentType })
            imageFiles.push(file)
          } else {
            // If it's a URL, fetch and convert to File
            const response = await fetch(imageData.data)
            const blob = await response.blob()
            const filename = `lens-${Date.now()}.${blob.type.split('/')[1] || 'png'}`
            const file = new File([blob], filename, { type: blob.type })
            imageFiles.push(file)
          }
        }

        if (imageFiles.length === 0) {
          throw new HTTPException(400, {
            message: 'Failed to process any images',
          })
        }

        console.log(
          '[prepare-lens-metadata] imageFiles:',
          imageFiles.map((f) => ({ name: f.name, type: f.type, size: f.size })),
        )

        // Upload to Lens Grove with metadata
        const { folder, files } = await lensGroveStorageClient.uploadFolder(
          imageFiles,
          {
            acl,
            index: (resources: Resource[]) => {
              // Only take the first imageFiles.length resources, to exclude the auto-generated index file
              const imageResources = resources.slice(0, imageFiles.length)
              console.log(
                '[prepare-lens-metadata] filtered imageResources:',
                imageResources,
              )
              let metadata: unknown
              if (imageResources.length > 1) {
                metadata = image({
                  image: {
                    item: imageResources[0].uri,
                    type: MediaImageMimeType.PNG,
                    altTag: payload.images[0]?.altText || payload.title,
                  },
                  attachments: imageResources
                    .slice(1)
                    .map((resource, index) => ({
                      item: resource.uri,
                      type: MediaImageMimeType.PNG,
                      altTag:
                        payload.images[index + 1]?.altText ||
                        `Image ${index + 1}`,
                    })),
                  title: payload.title,
                  ...(payload.description && { content: payload.description }),
                })
              } else {
                metadata = image({
                  image: {
                    item: imageResources[0].uri,
                    type: MediaImageMimeType.PNG,
                    altTag: payload.images[0]?.altText || payload.title,
                  },
                  title: payload.title,
                  ...(payload.description && { content: payload.description }),
                })
              }
              console.log(
                '[prepare-lens-metadata] generated metadata:',
                metadata,
              )
              return metadata
            },
          },
        )
        console.log('[prepare-lens-metadata] upload result folder:', folder)
        console.log('[prepare-lens-metadata] upload result files:', files)

        contentUri = folder.uri
      } else {
        // Text-only post
        const metadata = textOnly({
          content: payload.description || payload.title,
        })

        const { uri } = await lensGroveStorageClient.uploadAsJson(metadata, {
          acl,
        })
        contentUri = uri
      }

      return c.json({ contentUri })
    } catch (error) {
      if (error instanceof HTTPException) throw error
      console.error('Error preparing Lens metadata:', error)
      throw new HTTPException(500, {
        message: 'Failed to prepare Lens metadata',
      })
    }
  },
)

export default postRoutes
