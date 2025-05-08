import { apiClient } from './apiClient' // Import new client and error type

// ----- Types for User Profile Data -----

// Individual post item for the user's gallery
export interface ProfilePostItem {
  id: number
  title: string | null
  coverImg: string | null
  likeCount: number | null
  commentCount: number | null
  viewCount: number | null
  remixCount: number | null
  createdAt: string // ISOStringDate
}

// Structure for the paginated posts list
export interface ProfilePostsPage {
  items: ProfilePostItem[]
  pageInfo: {
    hasNextPage: boolean
    nextOffset: number | null
  }
}

// Structure for the user's profile details
export interface UserProfile {
  id: string
  username: string
  name: string | null
  image: string | null
  bio: string | null
  followerCount: number
  followingCount: number
  createdAt: string // ISOStringDate
  // isFollowing?: boolean // Future: if requesting user is authenticated
}

// Combined response type for the getProfile endpoint
export interface UserProfileData {
  user: UserProfile
  posts: ProfilePostsPage
}

// ----- API Function -----

/**
 * Fetches a user's profile information and their public posts.
 * @param profileUserId - The ID of the user whose profile to fetch.
 * @param pagination - Optional pagination parameters for the posts.
 */
export async function getUserProfile(
  profileUserId: string,
  pagination?: { limit?: number; offset?: number },
): Promise<UserProfileData> {
  if (!profileUserId) {
    // Client-side validation, can remain or be handled by UI
    throw new Error('Profile User ID is required.')
  }

  const queryParams = new URLSearchParams()
  if (pagination?.limit !== undefined) {
    queryParams.append('limit', String(pagination.limit))
  }
  if (pagination?.offset !== undefined) {
    queryParams.append('offset', String(pagination.offset))
  }
  const queryString = queryParams.toString() ? `?${queryParams.toString()}` : ''

  return apiClient<UserProfileData>(
    `/users/${profileUserId}/profile${queryString}`,
  )
}

/**
 * Fetches a user's profile information and their public posts using their username.
 * @param username - The username of the user whose profile to fetch.
 * @param pagination - Optional pagination parameters for the posts.
 */
export async function getUserProfileByUsername(
  username: string,
  pagination?: { limit?: number; offset?: number },
): Promise<UserProfileData> {
  if (!username) {
    throw new Error('Username is required.')
  }

  const queryParams = new URLSearchParams()
  if (pagination?.limit !== undefined) {
    queryParams.append('limit', String(pagination.limit))
  }
  if (pagination?.offset !== undefined) {
    queryParams.append('offset', String(pagination.offset))
  }
  const queryString = queryParams.toString() ? `?${queryParams.toString()}` : ''

  return apiClient<UserProfileData>(
    `/users/by-username/${username}/profile${queryString}`,
  )
}

// Potentially add functions for follow/unfollow user here later if not already elsewhere
// export async function followUser(targetUserId: string): Promise<{ success: boolean; message: string }> { ... }
// export async function unfollowUser(targetUserId: string): Promise<{ success: boolean; message: string }> { ... }
