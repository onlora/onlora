import { zValidator } from '@hono/zod-validator'
import { and, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { db } from '../db'
import { users } from '../db/auth-schema'
import { follows, posts } from '../db/schema' // Assuming follows schema is in schema.ts // IMPORT posts
import {
  type AuthenticatedContextEnv,
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

        // TODO: Optionally create a notification
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

// GET /api/users/:profileUserId/profile - Fetch user profile and their public posts
userRoutes.get(
  '/:profileUserId/profile',
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
    // const requestingUser = c.get('user') // For future use (e.g., isFollowing)

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
          // Exclude sensitive fields like email, vibe_energy unless explicitly needed for profile
        },
      })

      if (!userProfile) {
        throw new HTTPException(404, { message: 'User profile not found' })
      }

      // 2. Fetch user's public posts (paginated)
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

      return c.json({
        user: userProfile,
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
        },
      })

      if (!userProfile) {
        throw new HTTPException(404, { message: 'User profile not found' })
      }

      const profileUserId = userProfile.id

      // 2. Fetch user's public posts (paginated)
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
        },
        orderBy: (posts, { desc }) => [desc(posts.createdAt)],
        limit: limit,
        offset: offset,
      })

      const hasNextPage = userPosts.length === limit

      return c.json({
        user: userProfile, // userProfile already contains all necessary user fields
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

export default userRoutes
