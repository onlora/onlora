import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { type Context, Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { db } from '../db'
import { follows, posts } from '../db/schema'
import type { AuthenticatedContextEnv } from '../middleware/auth' // Optional: if auth affects feed
import { requireAuthMiddleware } from '../middleware/auth'

// Define the specific Environment for this router
interface FeedRoutesAppEnv extends AuthenticatedContextEnv {
  Variables: {
    user?: AuthenticatedContextEnv['Variables']['user']
  }
  ValidatedData: {
    // Define specific query types if needed, or use a union
    query:
      | z.infer<typeof latestFeedQuerySchema>
      | z.infer<typeof trendingFeedQuerySchema>
      | z.infer<typeof followingFeedQuerySchema>
  }
}

const feedRoutes = new Hono<FeedRoutesAppEnv>()

const LATEST_FEED_PAGE_SIZE = 20

const latestFeedQuerySchema = z.object({
  page: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('1')
    .refine((val) => val >= 1, { message: 'Page must be 1 or greater' }),
  pageSize: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default(LATEST_FEED_PAGE_SIZE.toString())
    .refine((val) => val >= 5 && val <= 50, {
      message: 'Page size must be between 5 and 50',
    }),
})

// Helper type for the structure of posts in the feed
// Similar to PostDetails but potentially simpler for feed cards
interface FeedPost {
  id: number
  title: string | null
  coverImg: string | null // For the feed card
  createdAt: string | null
  author: {
    id: string
    name: string | null
    image: string | null
  } | null
  likeCount: number | null
  commentCount: number | null
  // Add any other fields needed for feed cards, e.g., viewCount
  viewCount?: number | null
}

// Helper type for trending posts from mv_post_hot
interface TrendingFeedPost {
  id: number // postId
  title: string | null
  coverImg: string | null
  author: {
    id: string | null // author_id from the view
    username: string | null // author_username
    avatarUrl: string | null // author_avatar_url
  } | null
  likeCount: number | null
  commentCount: number | null
  remixCount: number | null
  score: number | null
  createdAt: string | null
}

// Define a type for the raw row structure from mv_post_hot query
type MvPostHotRow = {
  id: number
  author_id: string | null
  title: string | null
  cover_img: string | null
  remix_count: number | null
  like_count: number | null
  comment_count: number | null
  score: number | null
  created_at: string | null // Date might come as string from raw query
  author_username: string | null
  author_avatar_url: string | null
}

// GET /api/feed/latest - Fetch latest public posts
feedRoutes.get(
  '/latest',
  zValidator('query', latestFeedQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: 'Validation failed', details: result.error.flatten() },
        400,
      )
    }
  }),
  async (c: Context<FeedRoutesAppEnv>) => {
    const { page, pageSize } = c.req.valid('query')
    const offset = (page - 1) * pageSize

    try {
      const latestPostsData = await db.query.posts.findMany({
        where: eq(posts.visibility, 'public'),
        orderBy: [desc(posts.createdAt)],
        limit: pageSize,
        offset: offset,
        with: {
          author: {
            columns: { id: true, name: true, image: true },
          },
        },
        // Select only necessary columns to keep payload small
        columns: {
          id: true,
          title: true,
          coverImg: true,
          createdAt: true,
          likeCount: true,
          commentCount: true,
          viewCount: true, // Assuming viewCount is available
        },
      })

      // Map to the FeedPost structure
      const feedPosts: FeedPost[] = latestPostsData.map((post) => ({
        id: post.id,
        title: post.title,
        coverImg: post.coverImg,
        createdAt: post.createdAt?.toISOString() ?? null,
        author: post.author,
        likeCount: post.likeCount,
        commentCount: post.commentCount,
        viewCount: post.viewCount,
      }))

      // Optionally, fetch total count for pagination metadata
      const totalPublicPostsResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(posts)
        .where(eq(posts.visibility, 'public'))
      const totalCount = totalPublicPostsResult[0]?.count ?? 0
      const totalPages = Math.ceil(totalCount / pageSize)

      return c.json({
        data: feedPosts,
        meta: {
          page,
          pageSize,
          totalCount,
          totalPages,
        },
      })
    } catch (error) {
      console.error('Error fetching latest feed:', error)
      return c.json({ error: 'Failed to fetch latest feed' }, 500)
    }
  },
)

const TRENDING_FEED_PAGE_SIZE = 15
const trendingFeedQuerySchema = z.object({
  page: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('1')
    .refine((val) => val >= 1, { message: 'Page must be 1 or greater' }),
  pageSize: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default(TRENDING_FEED_PAGE_SIZE.toString())
    .refine((val) => val >= 5 && val <= 30, {
      message: 'Page size must be between 5 and 30',
    }),
})

// GET /api/feed/trending - Fetch trending posts from mv_post_hot
feedRoutes.get(
  '/trending',
  zValidator('query', trendingFeedQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: 'Validation failed', details: result.error.flatten() },
        400,
      )
    }
  }),
  async (c: Context<FeedRoutesAppEnv>) => {
    const { page, pageSize } = c.req.valid('query')
    const offset = (page - 1) * pageSize

    try {
      // Drizzle doesn't have direct support for querying materialized views as if they are tables
      // in the same way it does for tables defined in schema.ts via db.query.materializedViewName.
      // We need to use a raw SQL query.
      // Ensure the columns selected match the TrendingFeedPost interface and mv_post_hot structure.
      const trendingPostsData = (await db.execute(sql`
        SELECT 
          id,
          author_id,
          title,
          cover_img,
          remix_count,
          like_count,
          comment_count,
          score,
          created_at,
          author_username,
          author_avatar_url
        FROM mv_post_hot
        ORDER BY score DESC, created_at DESC
        LIMIT ${pageSize}
        OFFSET ${offset};
      `)) as TrendingFeedPost[] // Type assertion, ensure query returns this shape

      // Map to the TrendingFeedPost structure, converting date and structuring author
      const feedPosts: TrendingFeedPost[] = (
        trendingPostsData as MvPostHotRow[]
      ).map((row: MvPostHotRow) => ({
        id: row.id,
        title: row.title,
        coverImg: row.cover_img,
        author: {
          id: row.author_id,
          username: row.author_username,
          avatarUrl: row.author_avatar_url,
        },
        likeCount: row.like_count,
        commentCount: row.comment_count,
        remixCount: row.remix_count,
        score: row.score,
        createdAt: row.created_at
          ? new Date(row.created_at).toISOString()
          : null,
      }))

      // For pagination meta, count total rows in mv_post_hot
      // Note: Counting large materialized views can be slow if not indexed or optimized well.
      const totalTrendingPostsResult = await db.execute(
        sql`SELECT count(*) as total_count FROM mv_post_hot;`,
      )
      const totalCount = Number(totalTrendingPostsResult[0]?.total_count ?? 0)
      const totalPages = Math.ceil(totalCount / pageSize)

      return c.json({
        data: feedPosts,
        meta: {
          page,
          pageSize,
          totalCount,
          totalPages,
        },
      })
    } catch (error) {
      console.error('Error fetching trending feed:', error)
      // It's good to check if the error is from the DB or elsewhere
      if (
        error instanceof Error &&
        error.message.includes('relation "mv_post_hot" does not exist')
      ) {
        return c.json(
          {
            error:
              'Trending feed is currently unavailable. The materialized view might not be created or refreshed yet.',
          },
          503,
        )
      }
      return c.json({ error: 'Failed to fetch trending feed' }, 500)
    }
  },
)

// Schema for following feed pagination (can reuse latestFeedQuerySchema)
const followingFeedQuerySchema = latestFeedQuerySchema

// GET /api/feed/following - Fetch posts from users the current user follows
feedRoutes.get(
  '/following',
  requireAuthMiddleware,
  zValidator('query', followingFeedQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: 'Validation failed', details: result.error.flatten() },
        400,
      )
    }
  }),
  async (c) => {
    const user = c.get('user')
    if (!user?.id) {
      // Should be guaranteed by middleware, but check again
      throw new HTTPException(401, { message: 'Authentication required' })
    }
    const userId = user.id

    const { page, pageSize } = c.req.valid('query')
    const offset = (page - 1) * pageSize

    try {
      // Get IDs of users followed by the current user
      const followedUsersResult = await db
        .select({ userId: follows.followingId })
        .from(follows)
        .where(eq(follows.followerId, userId))

      const followedUserIds = followedUsersResult.map((f) => f.userId)

      if (followedUserIds.length === 0) {
        // Return empty feed if not following anyone
        return c.json({
          data: [],
          meta: { page, pageSize, totalCount: 0, totalPages: 0 },
        })
      }

      // Fetch posts where authorId is in the array of followed IDs
      const followingPostsData = await db.query.posts.findMany({
        where: and(
          eq(posts.visibility, 'public'),
          inArray(posts.authorId, followedUserIds), // Use inArray
        ),
        orderBy: [desc(posts.createdAt)],
        limit: pageSize,
        offset: offset,
        with: {
          author: {
            columns: { id: true, name: true, image: true },
          },
        },
        columns: {
          id: true,
          title: true,
          coverImg: true,
          createdAt: true,
          likeCount: true,
          commentCount: true,
          viewCount: true,
        },
      })

      const feedPosts: FeedPost[] = followingPostsData.map((post) => ({
        id: post.id,
        title: post.title,
        coverImg: post.coverImg,
        createdAt: post.createdAt?.toISOString() ?? null,
        author: post.author,
        likeCount: post.likeCount,
        commentCount: post.commentCount,
        viewCount: post.viewCount,
      }))

      // Fetch total count for pagination metadata
      const totalFollowingPostsResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(posts)
        .where(
          and(
            eq(posts.visibility, 'public'),
            inArray(posts.authorId, followedUserIds),
          ),
        )

      const totalCount = totalFollowingPostsResult[0]?.count ?? 0
      const totalPages = Math.ceil(totalCount / pageSize)

      return c.json({
        data: feedPosts,
        meta: {
          page,
          pageSize,
          totalCount,
          totalPages,
        },
      })
    } catch (error) {
      console.error('Error fetching following feed:', error)
      return c.json({ error: 'Failed to fetch following feed' }, 500)
    }
  },
)

export default feedRoutes
