import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { db } from '../db'
import { users } from '../db/auth-schema'
import {
  bookmarks,
  follows,
  likes,
  notifications,
  posts,
  veTxns,
  visibilityEnum,
} from '../db/schema' // IMPORT posts and visibilityEnum
import {
  type AuthenticatedContextEnv,
  optionalAuthMiddleware,
  requireAuthMiddleware,
} from '../middleware/auth'

// Define the specific Environment for this router
interface UserRoutesAppEnv extends AuthenticatedContextEnv {}

const userRoutes = new Hono<UserRoutesAppEnv>()

const userIdParamSchema = z.object({
  targetUserId: z.string().min(1, 'Target User ID is required'),
})

// Schema for the new profile endpoint's path parameter
const profileUserIdParamSchema = z.object({
  profileUserId: z.string().min(1, 'Profile User ID is required'),
})

// Schema for the username-based profile endpoint's path parameter
const usernameParamSchema = z.object({
  username: z.string().min(1, 'Username is required'),
})

// Schema for pagination query parameters
const paginationQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .default('10')
    .transform(Number)
    .refine((val) => val > 0 && val <= 50, {
      message: 'Limit must be between 1 and 50',
    }),
  offset: z
    .string()
    .optional()
    .default('0')
    .transform(Number)
    .refine((val) => val >= 0, {
      message: 'Offset must be a non-negative number',
    }),
})

// Schema for updating user profile
const updateUserProfileSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty.').optional().nullable(),
  bio: z
    .string()
    .max(500, 'Bio cannot exceed 500 characters.')
    .optional()
    .nullable(),
  image: z.string().url('Invalid image URL format.').optional().nullable(), // Avatar URL
  bannerUrl: z.string().url('Invalid banner URL format.').optional().nullable(),
})

// Zod schema for notificationId param
const notificationIdParamSchema = z.object({
  notificationId: z
    .string()
    .uuid({ message: 'Notification ID must be a valid UUID.' }),
})

// Schema for visibility query parameter
const visibilityQuerySchema = z.object({
  visibility: z.enum(visibilityEnum.enumValues).optional(),
})

// Define a type for the bookmarked post item, similar to FeedPost
interface BookmarkedPostItem {
  id: string
  title: string | null
  coverImg: string | null
  createdAt: string | null // ISO string
  author: {
    id: string
    name: string | null
    image: string | null
    username: string | null // Changed to nullable string
  } | null
  likeCount: number | null
  commentCount: number | null
  viewCount?: number | null
  remixCount?: number | null
  bookmarkedAt: string | null // When this user bookmarked it
}

// POST /api/users/:targetUserId/follow
userRoutes.post(
  '/:targetUserId/follow',
  requireAuthMiddleware,
  zValidator('param', userIdParamSchema, (result, c) => {
    if (!result.success) {
      throw new HTTPException(400, { message: 'Invalid target user ID format' })
    }
  }),
  async (c) => {
    const user = c.get('user')
    if (!user || !user.id) {
      throw new HTTPException(401, { message: 'Authentication required' })
    }
    const { targetUserId } = c.req.valid('param')
    const followerId = user.id

    if (followerId === targetUserId) {
      throw new HTTPException(400, { message: 'Cannot follow yourself' })
    }

    try {
      // Check if target user exists
      const targetUserExists = await db.query.users.findFirst({
        where: eq(users.id, targetUserId),
        columns: { id: true },
      })
      if (!targetUserExists) {
        throw new HTTPException(404, { message: 'Target user not found' })
      }

      await db.transaction(async (tx) => {
        // Check if already following
        const existingFollow = await tx.query.follows.findFirst({
          where: and(
            eq(follows.followerId, followerId),
            eq(follows.followingId, targetUserId),
          ),
        })

        if (existingFollow) {
          // Optionally return 200 OK if already following, or a specific message
          // throw new HTTPException(409, { message: 'Already following this user' });
          // For idempotency, just returning success might be better
          return // Exit transaction, effectively a no-op if already followed
        }

        // Insert into follows table
        await tx.insert(follows).values({
          followerId: followerId,
          followingId: targetUserId,
        })

        // Increment followingCount for follower
        await tx
          .update(users)
          .set({ followingCount: sql`${users.followingCount} + 1` })
          .where(eq(users.id, followerId))

        // Increment followerCount for target user
        await tx
          .update(users)
          .set({ followerCount: sql`${users.followerCount} + 1` })
          .where(eq(users.id, targetUserId))

        // Create notification for the followed user
        await tx.insert(notifications).values({
          recipientId: targetUserId,
          actorId: followerId,
          type: 'follow',
          isRead: false,
          // postId and commentId are null for follow notifications
        })
      })

      return c.json(
        { success: true, message: 'User followed successfully' },
        201,
      )
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }
      console.error(
        `Error following user ${targetUserId} by ${followerId}:`,
        error,
      )
      throw new HTTPException(500, { message: 'Failed to follow user' })
    }
  },
)

// POST /api/users/:targetUserId/unfollow
userRoutes.post(
  '/:targetUserId/unfollow',
  requireAuthMiddleware,
  zValidator('param', userIdParamSchema, (result, c) => {
    if (!result.success) {
      throw new HTTPException(400, { message: 'Invalid target user ID format' })
    }
  }),
  async (c) => {
    const user = c.get('user')
    if (!user || !user.id) {
      throw new HTTPException(401, { message: 'Authentication required' })
    }
    const { targetUserId } = c.req.valid('param')
    const followerId = user.id

    if (followerId === targetUserId) {
      // Should not happen typically, but good to prevent
      throw new HTTPException(400, { message: 'Cannot unfollow yourself' })
    }

    try {
      // Check if target user exists (optional, but good for consistency)
      const targetUserExists = await db.query.users.findFirst({
        where: eq(users.id, targetUserId),
        columns: { id: true },
      })
      if (!targetUserExists) {
        throw new HTTPException(404, { message: 'Target user not found' })
      }

      await db.transaction(async (tx) => {
        // Check if the follow relationship exists
        const existingFollow = await tx.query.follows.findFirst({
          where: and(
            eq(follows.followerId, followerId),
            eq(follows.followingId, targetUserId),
          ),
          columns: { followerId: true }, // Select any column just to check existence
        })

        if (!existingFollow) {
          // Optionally return 404 or 200 OK if already not following
          // throw new HTTPException(404, { message: 'Not following this user' });
          // For idempotency, return success
          return
        }

        // Delete from follows table
        await tx
          .delete(follows)
          .where(
            and(
              eq(follows.followerId, followerId),
              eq(follows.followingId, targetUserId),
            ),
          )

        // Decrement followingCount for follower (ensure it doesn't go below 0)
        await tx
          .update(users)
          .set({
            followingCount: sql`GREATEST(0, ${users.followingCount} - 1)`,
          })
          .where(eq(users.id, followerId))

        // Decrement followerCount for target user (ensure it doesn't go below 0)
        await tx
          .update(users)
          .set({ followerCount: sql`GREATEST(0, ${users.followerCount} - 1)` })
          .where(eq(users.id, targetUserId))

        // TODO: Optionally remove/mark notification if one was created for the follow
      })

      return c.json(
        { success: true, message: 'User unfollowed successfully' },
        200,
      ) // 200 OK for unfollow
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }
      console.error(
        `Error unfollowing user ${targetUserId} by ${followerId}:`,
        error,
      )
      throw new HTTPException(500, { message: 'Failed to unfollow user' })
    }
  },
)

// PATCH /api/users/me/profile - Update current authenticated user's profile
userRoutes.patch(
  '/me/profile',
  requireAuthMiddleware,
  zValidator('json', updateUserProfileSchema, (result, c) => {
    if (!result.success) {
      throw new HTTPException(400, {
        message: 'Invalid profile data format',
        cause: result.error.flatten(),
      })
    }
  }),
  async (c) => {
    const user = c.get('user')
    if (!user || !user.id) {
      // This should be caught by requireAuthMiddleware, but as a safeguard:
      throw new HTTPException(401, { message: 'Authentication required' })
    }
    const updatePayload = c.req.valid('json')

    const updateData: Record<string, string | null> = {}
    // Filter out undefined values, and allow null to be passed for clearing fields.
    if (updatePayload.name !== undefined) updateData.name = updatePayload.name
    if (updatePayload.bio !== undefined) updateData.bio = updatePayload.bio
    if (updatePayload.image !== undefined)
      updateData.image = updatePayload.image
    if (updatePayload.bannerUrl !== undefined)
      updateData.banner_url = updatePayload.bannerUrl // Uncommented and use banner_url for DB

    if (Object.keys(updateData).length === 0) {
      // Simplified condition as bannerUrl is now part of updateData if provided
      // Return current profile if no actual data is sent for update, or a 304 Not Modified, or 400.
      // For simplicity, let's return 400 as it implies client error.
      throw new HTTPException(400, { message: 'No update data provided.' })
    }

    try {
      const updatedUsers = await db
        .update(users)
        .set(updateData) // Drizzle should handle Partial correctly
        .where(eq(users.id, user.id))
        .returning({
          id: users.id,
          username: users.username,
          name: users.name,
          email: users.email,
          image: users.image,
          bio: users.bio,
          bannerUrl: users.bannerUrl, // Uncommented and ensure it uses the schema name
          vibeEnergy: users.vibe_energy,
          followerCount: users.followerCount,
          followingCount: users.followingCount,
          createdAt: users.createdAt,
        })

      if (!updatedUsers || updatedUsers.length === 0) {
        // This case should ideally not happen if the user is authenticated and exists.
        throw new HTTPException(404, {
          message: 'User not found, cannot update.',
        })
      }
      // The user object from better-auth might not have all these fields.
      // We return the updated profile from the DB.
      return c.json(updatedUsers[0])
    } catch (error) {
      if (error instanceof HTTPException) throw error
      console.error(`Error updating profile for user ${user.id}:`, error)
      // Check for specific DB errors if needed, e.g., unique constraint violation on username if it were updatable here.
      throw new HTTPException(500, { message: 'Failed to update user profile' })
    }
  },
)

// GET /api/users/me/profile - Fetch current authenticated user's profile AND their posts
userRoutes.get(
  '/me/profile',
  requireAuthMiddleware,
  zValidator('query', paginationQuerySchema, (result, c) => {
    if (!result.success) {
      throw new HTTPException(400, {
        message: 'Invalid pagination parameters',
        cause: result.error.flatten(),
      })
    }
  }),
  async (c) => {
    console.log(
      'Fetching current user profile and posts ',
      c.req.valid('query'),
    )

    const user = c.get('user')
    const { limit, offset } = c.req.valid('query')

    if (!user || !user.id) {
      throw new HTTPException(500, {
        message: 'User context not found after auth.',
      })
    }

    try {
      // 1. Fetch user details
      const userProfileFromDb = await db.query.users.findFirst({
        where: eq(users.id, user.id),
        columns: {
          id: true,
          username: true,
          name: true,
          email: true,
          image: true,
          bio: true,
          bannerUrl: true, // Corrected: should be true to select the column
          vibe_energy: true,
          followerCount: true,
          followingCount: true,
          createdAt: true,
        },
      })

      if (!userProfileFromDb) {
        throw new HTTPException(404, {
          message: 'Authenticated user profile not found.',
        })
      }

      // Map to the UserProfile structure (frontend expects camelCase vibeEnergy)
      const userForResponse = {
        id: userProfileFromDb.id,
        username: userProfileFromDb.username,
        name: userProfileFromDb.name,
        email: userProfileFromDb.email,
        image: userProfileFromDb.image,
        bio: userProfileFromDb.bio,
        bannerUrl: userProfileFromDb.bannerUrl, // Add bannerUrl mapping
        vibeEnergy: userProfileFromDb.vibe_energy, // Map to camelCase
        followerCount: userProfileFromDb.followerCount,
        followingCount: userProfileFromDb.followingCount,
        createdAt: userProfileFromDb.createdAt,
      }

      // 2. Fetch user's posts (paginated)
      const userPosts = await db.query.posts.findMany({
        where: eq(posts.authorId, user.id), // No visibility filter for own posts, or filter as desired
        columns: {
          id: true,
          title: true,
          coverImg: true,
          likeCount: true,
          commentCount: true,
          viewCount: true,
          remixCount: true,
          createdAt: true,
          visibility: true, // Good to have for own posts view
        },
        orderBy: (postsTable, { desc }) => [desc(postsTable.createdAt)],
        limit: limit,
        offset: offset,
      })

      const hasNextPage = userPosts.length === limit

      return c.json({
        user: userForResponse, // Use the explicitly mapped user object
        posts: {
          items: userPosts,
          pageInfo: {
            hasNextPage,
            nextOffset: hasNextPage ? offset + limit : null,
          },
        },
      })
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }
      console.error(`Error fetching profile data for user ${user.id}:`, error)
      throw new HTTPException(500, {
        message: 'Failed to fetch user profile data',
      })
    }
  },
)

// GET /api/users/:profileUserId/profile - Fetch user profile and their public posts
userRoutes.get(
  '/:profileUserId/profile',
  optionalAuthMiddleware,
  zValidator('param', profileUserIdParamSchema, (result, c) => {
    if (!result.success) {
      throw new HTTPException(400, {
        message: 'Invalid Profile User ID format',
        cause: result.error.flatten(),
      })
    }
  }),
  zValidator('query', paginationQuerySchema, (result, c) => {
    if (!result.success) {
      throw new HTTPException(400, {
        message: 'Invalid pagination parameters',
        cause: result.error.flatten(),
      })
    }
  }),
  async (c) => {
    const { profileUserId } = c.req.valid('param')
    const { limit, offset } = c.req.valid('query')
    const requestingUser = c.get('user') // Get optional authenticated user

    try {
      // 1. Fetch user details
      const userProfile = await db.query.users.findFirst({
        where: eq(users.id, profileUserId),
        columns: {
          id: true,
          username: true,
          name: true,
          image: true,
          bio: true,
          followerCount: true,
          followingCount: true,
          createdAt: true,
          vibe_energy: true, // Include for potential future use, even if not shown publicly
          // Exclude sensitive fields like email
        },
      })

      if (!userProfile) {
        throw new HTTPException(404, { message: 'User profile not found' })
      }

      // 2. Check follow status if a user is logged in and viewing someone else's profile
      let isFollowing = false
      if (requestingUser && requestingUser.id !== userProfile.id) {
        const followCheck = await db.query.follows.findFirst({
          where: and(
            eq(follows.followerId, requestingUser.id),
            eq(follows.followingId, userProfile.id),
          ),
          columns: { followerId: true }, // Only need to check existence
        })
        isFollowing = !!followCheck
      }

      // 3. Fetch user's public posts (paginated)
      const userPosts = await db.query.posts.findMany({
        where: and(
          eq(posts.authorId, profileUserId),
          eq(posts.visibility, 'public'),
        ),
        columns: {
          id: true,
          title: true,
          coverImg: true,
          likeCount: true,
          commentCount: true,
          viewCount: true,
          remixCount: true,
          createdAt: true,
          // Add other fields if needed for gallery view (e.g., tags, bodyMd summary)
        },
        orderBy: (posts, { desc }) => [desc(posts.createdAt)],
        limit: limit,
        offset: offset,
      })

      // For simple offset pagination, hasNextPage can be determined by fetching one more item
      // than requested 'limit' and checking if it exists.
      // Or, more simply, if the number of items returned equals the limit,
      // there *might* be a next page. A count query would be more accurate.
      const hasNextPage = userPosts.length === limit
      // For this simple pagination, endCursor is not strictly necessary,
      // the next offset would be currentOffset + limit.
      // If using cursor-based pagination, endCursor would be the ID or timestamp of the last item.

      // Map DB result to expected response structure, including isFollowing
      const userForResponse = {
        id: userProfile.id,
        username: userProfile.username,
        name: userProfile.name,
        image: userProfile.image,
        bio: userProfile.bio,
        // Don't include vibeEnergy or email in public profiles generally
        followerCount: userProfile.followerCount,
        followingCount: userProfile.followingCount,
        createdAt: userProfile.createdAt,
        isFollowing: isFollowing, // Add the follow status
      }

      return c.json({
        user: userForResponse,
        posts: {
          items: userPosts,
          pageInfo: {
            hasNextPage,
            // For simple offset, nextOffset can be calculated on the client or returned
            nextOffset: hasNextPage ? offset + limit : null,
          },
        },
      })
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }
      console.error(`Error fetching profile for user ${profileUserId}:`, error)
      const errorMessage =
        error instanceof Error ? error.message : 'Internal server error'
      throw new HTTPException(500, {
        message: 'Failed to fetch user profile',
        cause: errorMessage,
      })
    }
  },
)

// GET /api/users/by-username/:username/profile - Fetch user profile and posts by username
userRoutes.get(
  '/by-username/:username/profile',
  optionalAuthMiddleware,
  zValidator('param', usernameParamSchema, (result, c) => {
    if (!result.success) {
      throw new HTTPException(400, {
        message: 'Invalid Username format',
        cause: result.error.flatten(),
      })
    }
  }),
  zValidator('query', paginationQuerySchema, (result, c) => {
    if (!result.success) {
      throw new HTTPException(400, {
        message: 'Invalid pagination parameters',
        cause: result.error.flatten(),
      })
    }
  }),
  async (c) => {
    const { username } = c.req.valid('param')
    const { limit, offset } = c.req.valid('query')
    const requestingUser = c.get('user') // Get optional authenticated user

    try {
      // 1. Fetch user by username to get their ID and profile details
      const userProfile = await db.query.users.findFirst({
        where: eq(users.username, username),
        columns: {
          id: true,
          username: true,
          name: true,
          image: true,
          bio: true,
          followerCount: true,
          followingCount: true,
          createdAt: true,
          vibe_energy: true, // Include for potential future use
        },
      })

      if (!userProfile) {
        throw new HTTPException(404, { message: 'User profile not found' })
      }

      // 2. Check follow status if a user is logged in and viewing someone else's profile
      let isFollowing = false
      if (requestingUser && requestingUser.id !== userProfile.id) {
        const followCheck = await db.query.follows.findFirst({
          where: and(
            eq(follows.followerId, requestingUser.id),
            eq(follows.followingId, userProfile.id),
          ),
          columns: { followerId: true }, // Only need to check existence
        })
        isFollowing = !!followCheck
      }

      // 3. Fetch user's public posts (paginated)
      const userPosts = await db.query.posts.findMany({
        where: and(
          eq(posts.authorId, userProfile.id),
          eq(posts.visibility, 'public'),
        ),
        columns: {
          id: true,
          title: true,
          coverImg: true,
          likeCount: true,
          commentCount: true,
          viewCount: true,
          remixCount: true,
          createdAt: true,
        },
        orderBy: (posts, { desc }) => [desc(posts.createdAt)],
        limit: limit,
        offset: offset,
      })

      const hasNextPage = userPosts.length === limit

      // Map DB result to expected response structure, including isFollowing
      const userForResponse = {
        id: userProfile.id,
        username: userProfile.username,
        name: userProfile.name,
        image: userProfile.image,
        bio: userProfile.bio,
        // Don't include vibeEnergy or email in public profiles generally
        followerCount: userProfile.followerCount,
        followingCount: userProfile.followingCount,
        createdAt: userProfile.createdAt,
        isFollowing: isFollowing, // Add the follow status
      }

      return c.json({
        user: userForResponse,
        posts: {
          items: userPosts,
          pageInfo: {
            hasNextPage,
            nextOffset: hasNextPage ? offset + limit : null,
          },
        },
      })
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }
      console.error(`Error fetching profile for username ${username}:`, error)
      const errorMessage =
        error instanceof Error ? error.message : 'Internal server error'
      throw new HTTPException(500, {
        message: 'Failed to fetch user profile by username',
        cause: errorMessage,
      })
    }
  },
)

// GET /api/users/me/notifications - Fetch notifications for the current user (paginated)
userRoutes.get(
  '/me/notifications',
  requireAuthMiddleware,
  zValidator('query', paginationQuerySchema, (result, c) => {
    if (!result.success) {
      throw new HTTPException(400, {
        message: 'Invalid pagination parameters',
        cause: result.error.flatten(),
      })
    }
  }),
  async (c) => {
    const user = c.get('user')
    if (!user || !user.id) {
      throw new HTTPException(500, {
        message: 'User context not found after auth.',
      })
    }
    const userId = user.id
    const { limit, offset } = c.req.valid('query')

    try {
      const notificationsQuery = db.query.notifications.findMany({
        where: eq(notifications.recipientId, userId),
        orderBy: (notificationsTable, { desc }) => [
          desc(notificationsTable.createdAt),
        ],
        limit: limit,
        offset: offset,
        with: {
          actor: {
            // Select specific fields from the user who acted
            columns: { id: true, username: true, name: true, image: true },
          },
          post: {
            // Select specific fields from the related post
            columns: { id: true, title: true, coverImg: true }, // Add coverImg
          },
          // Comment details are usually less important for the notification list itself,
          // but could be fetched if needed (e.g., comment snippet).
          // comment: {
          //   columns: { id: true, body: true }
          // }
        },
      })

      const userNotifications = await notificationsQuery

      // Simple pagination check
      const hasNextPage = userNotifications.length === limit

      return c.json({
        items: userNotifications,
        pageInfo: {
          hasNextPage,
          nextOffset: hasNextPage ? offset + limit : null,
        },
      })
    } catch (error) {
      if (error instanceof HTTPException) throw error
      console.error(`Error fetching notifications for user ${userId}:`, error)
      throw new HTTPException(500, {
        message: 'Failed to fetch notifications',
      })
    }
  },
)

// PATCH /api/users/me/notifications/:notificationId/read - Mark a notification as read
userRoutes.patch(
  '/me/notifications/:notificationId/read',
  requireAuthMiddleware,
  zValidator('param', notificationIdParamSchema, (result, c) => {
    if (!result.success) {
      throw new HTTPException(400, {
        message: 'Invalid Notification ID format',
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
    const { notificationId } = c.req.valid('param')

    try {
      // Find the notification and verify ownership
      const notification = await db.query.notifications.findFirst({
        where: and(
          eq(notifications.id, notificationId),
          eq(notifications.recipientId, userId),
        ),
        columns: { id: true, isRead: true },
      })

      if (!notification) {
        // Return 404 even if notification exists but belongs to another user for security
        throw new HTTPException(404, { message: 'Notification not found' })
      }

      // Only update if it's not already read
      if (!notification.isRead) {
        await db
          .update(notifications)
          .set({ isRead: true })
          .where(eq(notifications.id, notificationId))
      }

      return c.json(
        { success: true, message: 'Notification marked as read' },
        200,
      )
    } catch (error) {
      if (error instanceof HTTPException) throw error
      console.error(
        `Error marking notification ${notificationId} as read for user ${userId}:`,
        error,
      )
      throw new HTTPException(500, {
        message: 'Failed to mark notification as read',
      })
    }
  },
)

// PATCH /api/users/me/notifications/read-all - Mark all unread notifications as read
userRoutes.patch(
  '/me/notifications/read-all',
  requireAuthMiddleware,
  async (c) => {
    const user = c.get('user')
    if (!user || !user.id) {
      throw new HTTPException(401, { message: 'Authentication required' })
    }
    const userId = user.id

    try {
      const result = await db
        .update(notifications)
        .set({ isRead: true })
        .where(
          and(
            eq(notifications.recipientId, userId),
            eq(notifications.isRead, false),
          ),
        )
        .returning({ id: notifications.id }) // Returning IDs might be useful for debugging or counts

      const updatedCount = result.length

      return c.json(
        {
          success: true,
          message: `${updatedCount} notification(s) marked as read.`,
          updatedCount: updatedCount,
        },
        200,
      )
    } catch (error) {
      console.error(
        `Error marking all notifications as read for user ${userId}:`,
        error,
      )
      throw new HTTPException(500, {
        message: 'Failed to mark all notifications as read',
      })
    }
  },
)

// GET /api/users/me/liked-posts - Fetch posts liked by the current user (paginated)
userRoutes.get(
  '/me/liked-posts',
  requireAuthMiddleware,
  zValidator('query', paginationQuerySchema, (result, c) => {
    if (!result.success) {
      throw new HTTPException(400, {
        message: 'Invalid pagination parameters',
        cause: result.error.flatten(),
      })
    }
  }),
  async (c) => {
    const user = c.get('user')
    if (!user || !user.id) {
      throw new HTTPException(500, {
        message: 'User context not found after auth.',
      })
    }
    const userId = user.id
    const { limit, offset } = c.req.valid('query')

    try {
      // Find like records for the user, ordered by when they liked the post
      const likedPostsQuery = db
        .select({
          // Select desired fields from the posts table
          id: posts.id,
          title: posts.title,
          coverImg: posts.coverImg,
          likeCount: posts.likeCount,
          commentCount: posts.commentCount,
          viewCount: posts.viewCount,
          remixCount: posts.remixCount,
          createdAt: posts.createdAt,
          // TODO: Add author info if needed for display card?
          // authorId: posts.authorId,
        })
        .from(likes)
        .innerJoin(posts, eq(likes.postId, posts.id))
        .where(eq(likes.userId, userId))
        .orderBy(sql`${likes.createdAt} DESC`)
        .limit(limit)
        .offset(offset)

      const likedPosts = await likedPostsQuery

      // Check if there's a next page
      // This simple check is based on limit, could be more accurate with a count
      const hasNextPage = likedPosts.length === limit

      return c.json({
        items: likedPosts,
        pageInfo: {
          hasNextPage,
          nextOffset: hasNextPage ? offset + limit : null,
        },
      })
    } catch (error) {
      if (error instanceof HTTPException) throw error
      console.error(`Error fetching liked posts for user ${userId}:`, error)
      throw new HTTPException(500, {
        message: 'Failed to fetch liked posts',
      })
    }
  },
)

// NOTE: VE routes could be in a separate veRoutes.ts file and mounted on /api/ve
// For now, adding daily check-in here for consolidation during initial implementation.

// Zod schema for VE transaction reasons (example, adjust as needed)
// This might live in a shared types/schema location if used elsewhere.
const VeTransactionReasonEnum = z.enum([
  'signup_bonus',
  'daily_login_bonus',
  'image_generation_cost',
  'image_generation_refund',
  'post_publish_bonus',
  'post_remixed_bonus',
])

// POST /api/users/ve/daily-check-in - Claim daily VE bonus
// (Mounted under /api/users as per current file structure, could be /api/ve/daily-check-in)
userRoutes.post(
  '/ve/daily-check-in', // Path relative to where userRoutes is mounted (e.g. /api/users/ve/daily-check-in)
  requireAuthMiddleware,
  async (c) => {
    const userSession = c.get('user')
    if (!userSession || !userSession.id) {
      throw new HTTPException(401, { message: 'Authentication required.' })
    }
    const userId = userSession.id

    try {
      const todayUTCStart = new Date()
      todayUTCStart.setUTCHours(0, 0, 0, 0)

      const currentUserState = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: {
          vibe_energy: true,
          last_daily_bonus_claimed_at: true,
        },
      })

      if (!currentUserState) {
        throw new HTTPException(404, { message: 'User not found.' })
      }

      let alreadyClaimedToday = false
      if (currentUserState.last_daily_bonus_claimed_at) {
        const lastClaimDate = new Date(
          currentUserState.last_daily_bonus_claimed_at,
        )
        if (lastClaimDate >= todayUTCStart) {
          alreadyClaimedToday = true
        }
      }

      if (alreadyClaimedToday) {
        return c.json({
          success: true,
          message: 'Daily bonus already claimed for today.',
          newVeBalance: currentUserState.vibe_energy,
          claimedToday: true,
          alreadyClaimed: true,
        })
      }

      // Award bonus
      const dailyBonusAmount = 10
      const newVeBalance =
        (currentUserState.vibe_energy || 0) + dailyBonusAmount

      await db.transaction(async (tx) => {
        // Update user's VE and last claimed timestamp
        await tx
          .update(users)
          .set({
            vibe_energy: newVeBalance,
            last_daily_bonus_claimed_at: new Date(),
          })
          .where(eq(users.id, userId))

        // Insert into veTxns table using actual schema
        await tx.insert(veTxns).values({
          userId: userId,
          delta: dailyBonusAmount,
          reason: VeTransactionReasonEnum.Enum.daily_login_bonus,
          refId: null, // refId is null for daily bonus
        })
        // console.log(`TODO: Record +${dailyBonusAmount} VE txn for user ${userId} for daily bonus.`) // Remove placeholder log
      })

      return c.json({
        success: true,
        message: 'Daily bonus claimed successfully!',
        newVeBalance: newVeBalance,
        claimedToday: true,
        alreadyClaimed: false,
      })
    } catch (error) {
      if (error instanceof HTTPException) throw error
      console.error(`Error claiming daily bonus for user ${userId}:`, error)
      throw new HTTPException(500, { message: 'Failed to claim daily bonus' })
    }
  },
)

// GET /api/users/me/posts - Fetches posts for the authenticated user (for gallery)
userRoutes.get(
  '/me/posts',
  requireAuthMiddleware,
  zValidator(
    'query',
    paginationQuerySchema.merge(visibilityQuerySchema),
    (result, c) => {
      if (!result.success) {
        return c.json(
          { error: 'Validation failed', details: result.error.flatten() },
          400,
        )
      }
    },
  ),
  async (c) => {
    const user = c.get('user')
    if (!user || !user.id) {
      throw new HTTPException(401, { message: 'User not authenticated' })
    }
    const userId = user.id
    const { limit, offset, visibility } = c.req.valid('query')

    try {
      const conditions = [eq(posts.authorId, userId)]
      if (visibility) {
        conditions.push(eq(posts.visibility, visibility))
      }

      const userPosts = await db.query.posts.findMany({
        where: and(...conditions),
        columns: {
          id: true,
          title: true,
          coverImg: true,
          likeCount: true,
          commentCount: true,
          viewCount: true,
          remixCount: true,
          createdAt: true,
          // No need for authorId, bodyMd, etc. for gallery card view
        },
        orderBy: [desc(posts.createdAt)],
        limit: limit + 1, // Fetch one extra to check for hasNextPage
        offset: offset,
      })

      const hasNextPage = userPosts.length > limit
      const itemsToReturn = hasNextPage ? userPosts.slice(0, limit) : userPosts
      const nextOffset = hasNextPage ? offset + limit : null

      return c.json({
        items: itemsToReturn,
        pageInfo: {
          hasNextPage,
          nextOffset,
        },
      })
    } catch (error) {
      console.error(`Error fetching posts for user ${userId}:`, error)
      throw new HTTPException(500, { message: 'Failed to fetch user posts' })
    }
  },
)

// Zod schema for VE transaction response item (adjust fields as needed)
const VeTransactionItemSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  delta: z.number().int(),
  reason: z.string().nullable(),
  refId: z.string().uuid().nullable(),
  createdAt: z.string(), // ISO string
})

// Zod schema for the paginated response
const PaginatedVeTransactionsSchema = z.object({
  items: z.array(VeTransactionItemSchema),
  pageInfo: z.object({
    hasNextPage: z.boolean(),
    nextOffset: z.number().nullable(),
  }),
})

// GET /api/users/me/ve-transactions - Fetch VE transaction history for the current user
userRoutes.get(
  '/me/ve-transactions',
  requireAuthMiddleware,
  zValidator('query', paginationQuerySchema, (result, c) => {
    if (!result.success) {
      throw new HTTPException(400, {
        message: 'Invalid pagination parameters',
        cause: result.error.flatten(),
      })
    }
  }),
  async (c) => {
    const user = c.get('user')
    if (!user || !user.id) {
      // Should not happen due to middleware, but belts and suspenders
      throw new HTTPException(401, { message: 'Authentication required' })
    }
    const userId = user.id
    const { limit, offset } = c.req.valid('query')

    try {
      // Fetch transactions for the user, ordered by most recent
      const transactions = await db.query.veTxns.findMany({
        where: eq(veTxns.userId, userId),
        orderBy: [desc(veTxns.createdAt)],
        limit: limit + 1, // Fetch one extra to determine if there is a next page
        offset: offset,
        // Optionally join with posts/comments based on refId/reason if needed for context
      })

      const hasNextPage = transactions.length > limit
      const itemsToReturn = hasNextPage
        ? transactions.slice(0, limit)
        : transactions
      const nextOffset = hasNextPage ? offset + limit : null

      // Map to expected format (ensure date is ISO string)
      const responseItems = itemsToReturn.map((txn) => ({
        ...txn,
        createdAt: txn.createdAt?.toISOString() ?? new Date(0).toISOString(), // Ensure valid date string
      }))

      // Validate response shape (optional but good practice)
      const responseData = PaginatedVeTransactionsSchema.parse({
        items: responseItems,
        pageInfo: {
          hasNextPage,
          nextOffset,
        },
      })

      return c.json(responseData)
    } catch (error) {
      if (error instanceof HTTPException) throw error
      if (error instanceof z.ZodError) {
        // Handle potential ZodError from response parsing
        console.error(
          `Zod validation error for VE history response for user ${userId}:`,
          error,
        )
        throw new HTTPException(500, {
          message: 'Internal error validating VE history response',
        })
      }
      console.error(`Error fetching VE transactions for user ${userId}:`, error)
      throw new HTTPException(500, {
        message: 'Failed to fetch VE transaction history',
      })
    }
  },
)

// GET /api/users/me/bookmarks - Get posts bookmarked by the current user
userRoutes.get(
  '/me/bookmarks',
  requireAuthMiddleware,
  zValidator('query', paginationQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: 'Validation failed', details: result.error.flatten() },
        400,
      )
    }
  }),
  async (c) => {
    const user = c.get('user')
    if (!user) {
      return c.json({ error: 'User not authenticated' }, 401)
    }
    const userId = user.id
    const { limit, offset } = c.req.valid('query')

    try {
      const results = await db.query.bookmarks.findMany({
        where: eq(bookmarks.userId, userId),
        orderBy: [desc(bookmarks.createdAt)],
        limit: limit,
        offset: offset,
        with: {
          post: {
            columns: {
              id: true,
              title: true,
              coverImg: true,
              createdAt: true,
              likeCount: true,
              commentCount: true,
              viewCount: true,
              remixCount: true,
              visibility: true,
              authorId: true,
            },
            with: {
              author: {
                columns: { id: true, name: true, image: true, username: true },
              },
            },
          },
        },
      })

      // Map results and then filter out nulls
      const mappedBookmarks = results.map((b) => {
        if (!b.post || b.post.visibility !== 'public') {
          return null
        }
        const postDetails = b.post
        const authorDetails = postDetails.author
        // Construct the object matching BookmarkedPostItem structure explicitly
        const bookmarkedItem: BookmarkedPostItem = {
          id: postDetails.id,
          title: postDetails.title,
          coverImg: postDetails.coverImg,
          createdAt: postDetails.createdAt?.toISOString() ?? null,
          author: authorDetails
            ? {
                id: authorDetails.id,
                name: authorDetails.name, // string | null
                image: authorDetails.image, // string | null
                username: authorDetails.username, // string | null
              }
            : null,
          likeCount: postDetails.likeCount,
          commentCount: postDetails.commentCount,
          viewCount: postDetails.viewCount,
          remixCount: postDetails.remixCount,
          bookmarkedAt: b.createdAt?.toISOString() ?? null,
        }
        return bookmarkedItem
      })

      // Filter out the null values and assert the final type
      const formattedBookmarks = mappedBookmarks.filter(
        (item) => item !== null,
      ) as BookmarkedPostItem[]

      // ... total count query remains the same ...
      const totalBookmarksCountResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(bookmarks)
        .innerJoin(posts, eq(bookmarks.postId, posts.id))
        .where(
          and(eq(bookmarks.userId, userId), eq(posts.visibility, 'public')),
        )

      const totalCount = totalBookmarksCountResult[0]?.count ?? 0
      const totalPages = Math.ceil(totalCount / limit)

      return c.json({
        data: formattedBookmarks,
        meta: {
          limit,
          offset,
          totalCount,
          totalPages,
          currentPage: Math.floor(offset / limit) + 1,
        },
      })
    } catch (error) {
      console.error('Error fetching bookmarked posts for user:', userId, error)
      throw new HTTPException(500, {
        message: 'Failed to fetch bookmarked posts',
      })
    }
  },
)

// GET /api/users/:userId/bookmarks - Get public posts bookmarked by a specific user
userRoutes.get(
  '/:userId/bookmarks',
  zValidator(
    'param',
    z.object({
      userId: z.string().min(1),
    }),
    (result, c) => {
      if (!result.success) {
        return c.json({ error: 'Invalid user ID' }, 400)
      }
    },
  ),
  zValidator('query', paginationQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: 'Validation failed', details: result.error.flatten() },
        400,
      )
    }
  }),
  async (c) => {
    const { userId } = c.req.valid('param')
    const { limit, offset } = c.req.valid('query')

    try {
      // Check if user exists
      const userExists = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { id: true },
      })

      if (!userExists) {
        return c.json({ error: 'User not found' }, 404)
      }

      // Get only publicly visible bookmarked posts
      const results = await db.query.bookmarks.findMany({
        where: eq(bookmarks.userId, userId),
        orderBy: [desc(bookmarks.createdAt)],
        limit: limit,
        offset: offset,
        with: {
          post: {
            columns: {
              id: true,
              title: true,
              coverImg: true,
              createdAt: true,
              likeCount: true,
              commentCount: true,
              viewCount: true,
              remixCount: true,
              visibility: true,
              authorId: true,
            },
            with: {
              author: {
                columns: { id: true, name: true, image: true, username: true },
              },
            },
          },
        },
      })

      // Map results and filter out private posts
      const mappedBookmarks = results.map((b) => {
        if (!b.post || b.post.visibility !== 'public') {
          return null
        }
        const postDetails = b.post
        const authorDetails = postDetails.author

        return {
          id: postDetails.id,
          title: postDetails.title,
          coverImg: postDetails.coverImg,
          createdAt: postDetails.createdAt?.toISOString() ?? null,
          author: authorDetails
            ? {
                id: authorDetails.id,
                name: authorDetails.name,
                image: authorDetails.image,
                username: authorDetails.username,
              }
            : null,
          likeCount: postDetails.likeCount,
          commentCount: postDetails.commentCount,
          viewCount: postDetails.viewCount,
          remixCount: postDetails.remixCount,
          bookmarkedAt: b.createdAt?.toISOString() ?? null,
        }
      })

      // Filter out the null values
      const formattedBookmarks = mappedBookmarks.filter((item) => item !== null)

      // Get total count for pagination
      const totalBookmarksCountResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(bookmarks)
        .innerJoin(posts, eq(bookmarks.postId, posts.id))
        .where(
          and(eq(bookmarks.userId, userId), eq(posts.visibility, 'public')),
        )

      const totalCount = totalBookmarksCountResult[0]?.count ?? 0
      const totalPages = Math.ceil(totalCount / limit)

      return c.json({
        data: formattedBookmarks,
        meta: {
          limit,
          offset: offset,
          totalCount,
          totalPages,
          currentPage: Math.floor(Number(offset) / limit) + 1,
        },
      })
    } catch (error) {
      console.error('Error fetching bookmarked posts for user:', userId, error)
      throw new HTTPException(500, {
        message: 'Failed to fetch bookmarked posts',
      })
    }
  },
)

// GET /api/users/:userId/liked-posts - Get posts liked by a specific user
userRoutes.get(
  '/:userId/liked-posts',
  zValidator(
    'param',
    z.object({
      userId: z.string().min(1),
    }),
    (result, c) => {
      if (!result.success) {
        return c.json({ error: 'Invalid user ID' }, 400)
      }
    },
  ),
  zValidator('query', paginationQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: 'Validation failed', details: result.error.flatten() },
        400,
      )
    }
  }),
  async (c) => {
    const { userId } = c.req.valid('param')
    const { limit, offset } = c.req.valid('query')

    try {
      // Check if user exists
      const userExists = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { id: true },
      })

      if (!userExists) {
        return c.json({ error: 'User not found' }, 404)
      }

      // Fetch liked posts - only publicly visible ones
      const likedPostsQuery = await db
        .select({
          id: posts.id,
          title: posts.title,
          coverImg: posts.coverImg,
          likeCount: posts.likeCount,
          commentCount: posts.commentCount,
          viewCount: posts.viewCount,
          remixCount: posts.remixCount,
          createdAt: posts.createdAt,
        })
        .from(likes)
        .innerJoin(posts, eq(likes.postId, posts.id))
        .where(and(eq(likes.userId, userId), eq(posts.visibility, 'public')))
        .orderBy(desc(likes.createdAt))
        .limit(limit)
        .offset(offset)

      // Get total count for pagination
      const totalLikedPostsCountResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(likes)
        .innerJoin(posts, eq(likes.postId, posts.id))
        .where(and(eq(likes.userId, userId), eq(posts.visibility, 'public')))

      const totalCount = totalLikedPostsCountResult[0]?.count ?? 0
      const totalPages = Math.ceil(totalCount / limit)

      return c.json({
        items: likedPostsQuery,
        pageInfo: {
          hasNextPage: likedPostsQuery.length === limit,
          nextOffset:
            likedPostsQuery.length === limit ? Number(offset) + limit : null,
        },
      })
    } catch (error) {
      console.error('Error fetching liked posts for user:', userId, error)
      throw new HTTPException(500, {
        message: 'Failed to fetch liked posts',
      })
    }
  },
)

export default userRoutes
