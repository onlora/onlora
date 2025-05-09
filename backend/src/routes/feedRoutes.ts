import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { type Context, Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { db } from '../db'
import { follows, likes, posts, users } from '../db/schema'
import type { AuthenticatedContextEnv } from '../middleware/auth'
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
} from '../middleware/auth'

const LATEST_FEED_PAGE_SIZE = 20
const RECOMMENDED_FEED_PAGE_SIZE = 15
const TRENDING_FEED_PAGE_SIZE = 15
const FOLLOWING_FEED_PAGE_SIZE = 20

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

const recommendedFeedQuerySchema = z.object({
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
    .default(RECOMMENDED_FEED_PAGE_SIZE.toString())
    .refine((val) => val >= 5 && val <= 30, {
      message: 'Page size must be between 5 and 30',
    }),
})

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

const followingFeedQuerySchema = z.object({
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
    .default(FOLLOWING_FEED_PAGE_SIZE.toString())
    .refine((val) => val >= 5 && val <= 50, {
      message: 'Page size must be between 5 and 50',
    }),
})

interface FeedRoutesAppEnv extends AuthenticatedContextEnv {
  Variables: {
    user?: AuthenticatedContextEnv['Variables']['user']
  }
  ValidatedData: {
    query:
      | z.infer<typeof latestFeedQuerySchema>
      | z.infer<typeof trendingFeedQuerySchema>
      | z.infer<typeof recommendedFeedQuerySchema>
      | z.infer<typeof followingFeedQuerySchema>
  }
}

const feedRoutes = new Hono<FeedRoutesAppEnv>()

interface FeedPost {
  id: number
  title: string | null
  coverImg: string | null
  createdAt: string | null
  author: {
    id: string
    name: string | null
    image: string | null
    username?: string
  } | null
  likeCount: number | null
  commentCount: number | null
  viewCount?: number | null
  remixCount?: number | null
  score?: number
}

interface TrendingFeedPost {
  id: number
  title: string | null
  coverImg: string | null
  author: {
    id: string | null
    username: string | null
    avatarUrl: string | null
  } | null
  likeCount: number | null
  commentCount: number | null
  remixCount: number | null
  score: number | null
  createdAt: string | null
}

type MvPostHotRow = {
  id: number
  author_id: string | null
  title: string | null
  cover_img: string | null
  remix_count: number | null
  like_count: number | null
  comment_count: number | null
  score: number | null
  created_at: string | null
  author_username: string | null
  author_avatar_url: string | null
}

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
    const { page, pageSize } = c.req.valid('query') as z.infer<
      typeof latestFeedQuerySchema
    >
    const offset = (page - 1) * pageSize

    try {
      const latestPostsData = await db.query.posts.findMany({
        where: eq(posts.visibility, 'public'),
        orderBy: [desc(posts.createdAt)],
        limit: pageSize,
        offset: offset,
        with: {
          author: {
            columns: { id: true, name: true, image: true, username: true },
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
          remixCount: true,
        },
      })

      const feedPosts: FeedPost[] = latestPostsData.map((post) => ({
        id: post.id,
        title: post.title,
        coverImg: post.coverImg,
        createdAt: post.createdAt?.toISOString() ?? null,
        author: post.author
          ? {
              id: post.author.id,
              name: post.author.name,
              image: post.author.image,
              username: post.author.username ?? undefined,
            }
          : null,
        likeCount: post.likeCount,
        commentCount: post.commentCount,
        viewCount: post.viewCount,
        remixCount: post.remixCount,
      }))

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
    const { page, pageSize } = c.req.valid('query') as z.infer<
      typeof trendingFeedQuerySchema
    >
    const offset = (page - 1) * pageSize

    try {
      const result = await db.execute(sql`
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
      `)
      const trendingPostsData = result.rows as MvPostHotRow[]

      const feedPosts: TrendingFeedPost[] = trendingPostsData.map(
        (row: MvPostHotRow) => ({
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
        }),
      )

      const countResult = (await db.execute(
        sql`SELECT COUNT(*) as count FROM mv_post_hot;`,
      )) as unknown as [{ count: number | string }]

      let totalCount = 0
      if (
        countResult &&
        countResult.length > 0 &&
        countResult[0] !== undefined
      ) {
        const countValue = countResult[0].count
        totalCount =
          typeof countValue === 'string'
            ? Number.parseInt(countValue, 10)
            : countValue
      }
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
      return c.json({ error: 'Failed to fetch trending feed' }, 500)
    }
  },
)

feedRoutes.get(
  '/recommended',
  optionalAuthMiddleware,
  zValidator('query', recommendedFeedQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: 'Validation failed', details: result.error.flatten() },
        400,
      )
    }
  }),
  async (c: Context<FeedRoutesAppEnv>) => {
    const { page, pageSize } = c.req.valid('query') as z.infer<
      typeof recommendedFeedQuerySchema
    >
    const offset = (page - 1) * pageSize
    const currentUser = c.get('user')

    try {
      const W_LIKES = 1.5
      const W_COMMENTS = 2.0
      const W_REMIXES = 2.5
      const W_AGE_DECAY_PER_DAY = 0.1

      const conditions = [eq(posts.visibility, 'public')]
      if (currentUser?.id) {
        conditions.push(sql`${posts.authorId} != ${currentUser.id}`)
        const likedPostIdsSubquery = db
          .select({ postId: likes.postId })
          .from(likes)
          .where(eq(likes.userId, currentUser.id))
        conditions.push(notInArray(posts.id, likedPostIdsSubquery))
      }

      const scoreSQL = sql<number>`(
          COALESCE(${posts.likeCount}, 0) * ${W_LIKES} +
          COALESCE(${posts.commentCount}, 0) * ${W_COMMENTS} +
          COALESCE(${posts.remixCount}, 0) * ${W_REMIXES}
        ) / (1 + EXTRACT(EPOCH FROM (NOW() - ${posts.createdAt})) / (3600 * 24) * ${W_AGE_DECAY_PER_DAY})`

      const recommendedPostsData = await db
        .select({
          id: posts.id,
          title: posts.title,
          coverImg: posts.coverImg,
          createdAt: posts.createdAt,
          authorId: posts.authorId,
          likeCount: posts.likeCount,
          commentCount: posts.commentCount,
          viewCount: posts.viewCount,
          remixCount: posts.remixCount,
          score: scoreSQL,
        })
        .from(posts)
        .where(and(...conditions))
        .orderBy(desc(scoreSQL), desc(posts.createdAt))
        .limit(pageSize)
        .offset(offset)

      const authorIds = [
        ...new Set(
          recommendedPostsData
            .map((p) => p.authorId)
            .filter(Boolean) as string[],
        ),
      ]
      let authorsMap: Map<
        string,
        {
          id: string
          name: string | null
          image: string | null
          username: string | null
        }
      > = new Map()
      if (authorIds.length > 0) {
        const authorDetails = await db.query.users.findMany({
          where: inArray(users.id, authorIds),
          columns: { id: true, name: true, image: true, username: true },
        })
        authorsMap = new Map(authorDetails.map((u) => [u.id, u]))
      }

      const feedPosts: FeedPost[] = recommendedPostsData.map((post) => {
        const authorData = post.authorId ? authorsMap.get(post.authorId) : null
        return {
          id: post.id,
          title: post.title,
          coverImg: post.coverImg,
          createdAt: post.createdAt?.toISOString() ?? null,
          author: authorData
            ? {
                id: authorData.id,
                name: authorData.name,
                image: authorData.image,
                username: authorData.username ?? undefined,
              }
            : null,
          likeCount: post.likeCount,
          commentCount: post.commentCount,
          viewCount: post.viewCount,
          remixCount: post.remixCount,
          score: post.score,
        }
      })

      const totalRecommendedEstimateResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(posts)
        .where(and(...conditions))
      const totalCount = totalRecommendedEstimateResult[0]?.count ?? 0
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
      console.error('Error fetching recommended feed:', error)
      if (error instanceof HTTPException) throw error
      const errorMessage =
        error instanceof Error ? error.message : 'Internal Server Error'
      throw new HTTPException(500, {
        message: 'Failed to fetch recommended feed',
        cause: errorMessage,
      })
    }
  },
)

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
  async (c: Context<FeedRoutesAppEnv>) => {
    const user = c.get('user')
    if (!user) {
      throw new HTTPException(401, { message: 'User not authenticated' })
    }
    const userId = user.id
    const { page, pageSize } = c.req.valid('query') as z.infer<
      typeof followingFeedQuerySchema
    >
    const offset = (page - 1) * pageSize

    try {
      const followedUsers = await db.query.follows.findMany({
        where: eq(follows.followerId, userId),
        columns: { followingId: true },
      })

      const followedUserIds = followedUsers.map((f) => f.followingId)

      if (followedUserIds.length === 0) {
        return c.json({
          data: [],
          meta: { page, pageSize, totalCount: 0, totalPages: 0 },
        })
      }

      const followingPostsData = await db.query.posts.findMany({
        where: and(
          eq(posts.visibility, 'public'),
          inArray(posts.authorId, followedUserIds),
        ),
        orderBy: [desc(posts.createdAt)],
        limit: pageSize,
        offset: offset,
        with: {
          author: {
            columns: { id: true, name: true, image: true, username: true },
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
          remixCount: true,
        },
      })

      const feedPosts: FeedPost[] = followingPostsData.map((post) => ({
        id: post.id,
        title: post.title,
        coverImg: post.coverImg,
        createdAt: post.createdAt?.toISOString() ?? null,
        author: post.author
          ? {
              id: post.author.id,
              name: post.author.name,
              image: post.author.image,
              username: post.author.username ?? undefined,
            }
          : null,
        likeCount: post.likeCount,
        commentCount: post.commentCount,
        viewCount: post.viewCount,
        remixCount: post.remixCount,
      }))

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
