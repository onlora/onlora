import { type RequestOptions, apiClient } from './apiClient' // Import new client and error type

// API_BASE_URL is now in apiClient.ts

// Type for Author info in feed posts (consistent with backend response)
export interface FeedPostAuthor {
  id: string | null // Can be null if author deleted?
  name: string | null // Corresponds to 'name' from /latest or 'username' from /trending
  image: string | null // Corresponds to 'image' from /latest or 'avatarUrl' from /trending
  username?: string // Added username (optional)
}

// Type for a single post item in the feed (standardized)
export interface FeedPost {
  id: string
  title: string | null
  coverImg: string | null // URL for the cover image
  createdAt: string | null // ISO date string
  author: FeedPostAuthor | null
  likeCount: number | null
  commentCount: number | null
  viewCount?: number | null // Optional, present in /latest
  remixCount?: number | null // Optional, present in /trending
  score?: number | null // Optional, present in /trending
}

// Type for the pagination metadata
export interface PaginationMeta {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

// Type for the overall API response for feed endpoints
export interface FeedApiResponse {
  data: FeedPost[]
  meta: PaginationMeta
}

// Raw types from backend before normalization (if they differ)
interface RawFeedItemAuthorNested {
  id: string | null
  name: string | null
  image: string | null
  username?: string | null // Added optional username
}

interface RawFeedItem {
  id: string
  title: string | null
  coverImg: string | null
  createdAt: string | null
  likeCount: number | null
  commentCount: number | null
  viewCount?: number | null
  remixCount?: number | null
  score?: number | null
  author?: RawFeedItemAuthorNested | null // For /latest, /recommended, /following structure
  author_id?: string | null // For /trending structure
  author_username?: string | null
  author_avatar_url?: string | null
}

interface RawFeedApiResponse {
  data: RawFeedItem[]
  meta: PaginationMeta
}

// --- API Fetching Functions --- //

/**
 * Fetches a specific feed type (latest, trending, following, recommended).
 * @param feedType Type of feed to fetch.
 * @param page Page number (1-indexed).
 * @param pageSize Number of items per page.
 * @param options Optional fetch options (e.g., credentials for /following, /recommended).
 */
async function fetchFeed(
  feedType: 'latest' | 'trending' | 'following' | 'recommended',
  page = 1,
  pageSize = 20,
  // Narrow down options to those compatible with Omit<RequestInit, 'body'>
  passThroughOptions?: Omit<RequestInit, 'body'>,
): Promise<FeedApiResponse> {
  const queryParams = new URLSearchParams()
  queryParams.set('page', String(page))
  queryParams.set('pageSize', String(pageSize))
  const queryString = queryParams.toString()

  // Explicitly set method to GET and spread other compatible options.
  // RequestOptions<never> signifies no body for this GET request.
  const apiCallOpts: RequestOptions<never> = {
    method: 'GET',
    ...(passThroughOptions || {}),
  }

  const rawData = await apiClient<RawFeedApiResponse>(
    `/feed/${feedType}?${queryString}`,
    apiCallOpts,
  )

  const normalizedData = rawData.data.map((item: RawFeedItem): FeedPost => {
    let author: FeedPostAuthor | null = null
    if (item.author) {
      author = {
        id: item.author.id ?? null,
        name: item.author.name ?? null,
        image: item.author.image ?? null,
        username: item.author.username ?? undefined, // Map username if present
      }
    } else if (
      item.author_id ||
      item.author_username ||
      item.author_avatar_url
    ) {
      author = {
        id: item.author_id ?? null,
        name: item.author_username ?? null, // Use username as name for trending if name not available
        image: item.author_avatar_url ?? null,
        username: item.author_username ?? undefined, // Map username for trending
      }
    }
    return {
      id: item.id,
      title: item.title ?? null,
      coverImg: item.coverImg ?? null,
      createdAt: item.createdAt ?? null,
      author: author,
      likeCount: item.likeCount ?? null,
      commentCount: item.commentCount ?? null,
      viewCount: item.viewCount ?? undefined, // Ensure undefined if null/missing
      remixCount: item.remixCount ?? undefined,
      score: item.score ?? undefined,
    }
  })

  return { data: normalizedData, meta: rawData.meta }
}

// Specific functions for each feed type

export function getLatestFeed(
  page = 1,
  pageSize = 20,
): Promise<FeedApiResponse> {
  return fetchFeed('latest', page, pageSize)
}

export function getTrendingFeed(
  page = 1,
  pageSize = 15,
): Promise<FeedApiResponse> {
  return fetchFeed('trending', page, pageSize)
}

export function getFollowingFeed(
  page = 1,
  pageSize = 20,
): Promise<FeedApiResponse> {
  // Requires authentication
  return fetchFeed('following', page, pageSize, { credentials: 'include' })
}

export function getRecommendedFeed(
  page = 1,
  pageSize = 15,
): Promise<FeedApiResponse> {
  // May require authentication for personalization
  return fetchFeed('recommended', page, pageSize, { credentials: 'include' })
}
