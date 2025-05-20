import { apiClient } from './apiClient'
import type { FeedPostAuthor } from './feedApi'; // Reuse author type if suitable

// --- Types --- //

// Type for a post item in search results (tailored)
export interface PostSearchResultItem {
  id: string
  title: string | null
  coverImg: string | null
  likeCount: number | null
  commentCount: number | null
  createdAt: string | null // ISO date string
  author: FeedPostAuthor | null // Use FeedPostAuthor
}

// Type for a user item in search results (tailored)
export interface UserSearchResultItem {
  id: string
  username: string
  name: string | null
  image: string | null
  bio: string | null
  followerCount: number
  followingCount: number
}

// Type for the API response from GET /api/search
export interface SearchResultsPage {
  posts?: PostSearchResultItem[]
  users?: UserSearchResultItem[]
  pageInfo: {
    hasNextPage: boolean
    nextOffset: number | null
  }
}

// Type for search parameters
export interface SearchParams {
  q: string
  type?: 'posts' | 'users'
  limit?: number
  offset?: number
}

// --- API Function --- //

/**
 * Performs a search for posts or users.
 */
export async function performSearch(
  params: SearchParams,
): Promise<SearchResultsPage> {
  const queryParams = new URLSearchParams()
  queryParams.set('q', params.q)
  if (params.type) {
    queryParams.set('type', params.type)
  }
  if (params.limit) {
    queryParams.set('limit', String(params.limit))
  }
  if (params.offset) {
    queryParams.set('offset', String(params.offset))
  }

  return apiClient<SearchResultsPage>(`/search?${queryParams.toString()}`)
}
