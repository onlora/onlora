import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, ilike, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { db } from '../db'
import { posts, users } from '../db/schema'
import type { AuthenticatedContextEnv } from '../middleware/auth' // Allow optional auth context

// Define the specific Environment for this router
interface SearchRoutesAppEnv extends AuthenticatedContextEnv {}

const searchRoutes = new Hono<SearchRoutesAppEnv>()

// Define search result types (adjust fields as needed)
interface PostSearchResult {
  id: number
  title: string | null
  coverImg: string | null
  likeCount: number | null
  commentCount: number | null
  createdAt: string | null
  author: {
    id: string
    username: string | null
    name: string | null
    image: string | null
  } | null
}

interface UserSearchResult {
  id: string
  username: string
  name: string | null
  image: string | null
  bio: string | null
  followerCount: number
  followingCount: number
}

// Schema for search query parameters
const searchQuerySchema = z.object({
  q: z.string().min(1, 'Search query is required').max(100),
  type: z.enum(['posts', 'users']).default('posts'),
  // Basic pagination
  limit: z
    .string()
    .optional()
    .default('10')
    .transform(Number)
    .refine((val) => val > 0 && val <= 50),
  offset: z
    .string()
    .optional()
    .default('0')
    .transform(Number)
    .refine((val) => val >= 0),
})

// GET /api/search - Search for posts or users
searchRoutes.get(
  '/',
  zValidator('query', searchQuerySchema, (result, c) => {
    if (!result.success) {
      throw new HTTPException(400, {
        message: 'Invalid search parameters',
        cause: result.error.flatten(),
      })
    }
  }),
  async (c) => {
    const { q: query, type, limit, offset } = c.req.valid('query')
    const searchPattern = `%${query}%` // Prepare pattern for LIKE/ILIKE

    try {
      let responsePayload: {
        posts?: PostSearchResult[]
        users?: UserSearchResult[]
        pageInfo: { hasNextPage: boolean; nextOffset: number | null }
      } = {
        // Initialize with a default structure to satisfy the compiler
        pageInfo: { hasNextPage: false, nextOffset: null },
      }

      if (type === 'posts') {
        const postResults = await db.query.posts.findMany({
          where: and(
            eq(posts.visibility, 'public'), // Only search public posts
            or(
              ilike(posts.title, searchPattern),
              ilike(posts.bodyMd, searchPattern),
              // TODO: Add search on tags array if needed (more complex query)
            ),
          ),
          columns: {
            id: true,
            title: true,
            coverImg: true,
            likeCount: true,
            commentCount: true,
            createdAt: true,
            // Add author minimal info for cards
            authorId: true,
          },
          with: {
            author: {
              columns: { id: true, username: true, name: true, image: true },
            },
          },
          orderBy: [desc(posts.createdAt)], // Or relevance score if using FTS
          limit: limit + 1, // Fetch extra for pagination check
          offset: offset,
        })
        const hasNextPage = postResults.length > limit
        const items = (hasNextPage
          ? postResults.slice(0, limit)
          : postResults) as unknown as PostSearchResult[] // Cast to unknown first, then to PostSearchResult[] for type safety with Date
        responsePayload = {
          posts: items.map((p) => ({
            // Ensure date is string
            ...p,
            createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
          })),
          pageInfo: {
            hasNextPage,
            nextOffset: hasNextPage ? offset + limit : null,
          },
        }
      } else if (type === 'users') {
        const userResults = await db.query.users.findMany({
          where: or(
            ilike(users.username, searchPattern),
            ilike(users.name, searchPattern),
          ),
          columns: {
            id: true,
            username: true,
            name: true,
            image: true,
            bio: true, // Include bio for context
            followerCount: true, // Include counts
            followingCount: true,
          },
          orderBy: [desc(users.createdAt)], // Or relevance score
          limit: limit + 1,
          offset: offset,
        })
        const hasNextPage = userResults.length > limit
        const items = (
          hasNextPage ? userResults.slice(0, limit) : userResults
        ) as UserSearchResult[]
        responsePayload = {
          users: items,
          pageInfo: {
            hasNextPage,
            nextOffset: hasNextPage ? offset + limit : null,
          },
        }
      }

      return c.json(responsePayload)
    } catch (error) {
      console.error(`Error searching for ${type} with query "${query}":`, error)
      throw new HTTPException(500, {
        message: `Failed to perform search for ${type}`,
      })
    }
  },
)

export default searchRoutes
