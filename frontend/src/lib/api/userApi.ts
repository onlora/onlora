import { apiClient } from './apiClient'
import type { PostDetails } from './postApi' // Import PostDetails

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
  email: string // Included for completeness, might not always be public
  image: string | null // Avatar URL
  bannerUrl: string | null // Profile banner URL
  bio: string | null
  vibeEnergy: number
  createdAt: string
  isFollowing?: boolean // Added optional field for follow status
  followerCount?: number // Added followerCount
  followingCount?: number // Added followingCount
  // TODO: Add arrays for user's vibes (posts) and liked vibes when those are fetched
  // posts: Post[];
  // likedPosts: Post[];
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

/**
 * Fetches the profile and posts for the currently authenticated user.
 */
export const getMyProfile = async (pagination?: {
  limit?: number
  offset?: number
}): Promise<UserProfileData> => {
  const queryParams = new URLSearchParams()
  if (pagination?.limit !== undefined) {
    queryParams.append('limit', String(pagination.limit))
  }
  if (pagination?.offset !== undefined) {
    queryParams.append('offset', String(pagination.offset))
  }
  const queryString = queryParams.toString() ? `?${queryParams.toString()}` : ''
  // Assuming the backend endpoint /users/me/profile now returns UserProfileData
  // and accepts pagination parameters.
  return apiClient<UserProfileData>(`/users/me/profile${queryString}`)
}

export interface UpdateUserProfilePayload {
  name?: string | null
  bio?: string | null
  bannerUrl?: string | null
  image?: string | null // For now, allow updating avatar URL directly. File upload is a separate feature.
}

/**
 * Updates the profile for the currently authenticated user.
 */
export const updateUserProfile = async (
  payload: UpdateUserProfilePayload,
): Promise<UserProfile> => {
  // Construct FormData
  const formData = new FormData()
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      if (value instanceof File) {
        formData.append(key, value)
      } else if (Array.isArray(value)) {
        // For arrays like socialLinks, append each item separately or stringify
        // Adjust based on how your backend expects array data with FormData
        formData.append(key, JSON.stringify(value)) // Example: stringify array
      } else {
        formData.append(key, String(value))
      }
    }
  })

  return apiClient<UserProfile>('/users/me/profile', {
    method: 'PUT',
    body: formData, // Use FormData directly
    credentials: 'include',
  })
}

// Potentially add functions for follow/unfollow user here later if not already elsewhere
export interface FollowResponse {
  success: boolean
  message: string
}

/**
 * Follows a target user.
 */
export const followUser = async (
  targetUserId: string,
): Promise<FollowResponse> => {
  return apiClient<FollowResponse>(`/users/${targetUserId}/follow`, {
    method: 'POST',
    credentials: 'include',
  })
}

/**
 * Unfollows a target user.
 */
export const unfollowUser = async (
  targetUserId: string,
): Promise<FollowResponse> => {
  return apiClient<FollowResponse>(`/users/${targetUserId}/unfollow`, {
    method: 'POST', // Typically unfollowing is also a POST or DELETE
    credentials: 'include',
  })
}

/**
 * Fetches posts created by the currently authenticated user.
 * Can optionally filter by visibility.
 * @param pagination - Optional pagination parameters.
 * @param visibility - Optional filter ('public' or 'private'). Fetches all if omitted.
 */
export const getMyPosts = async (
  pagination?: { limit?: number; offset?: number },
  visibility?: 'public' | 'private',
): Promise<ProfilePostsPage> => {
  const queryParams = new URLSearchParams()
  if (pagination?.limit !== undefined) {
    queryParams.append('limit', String(pagination.limit))
  }
  if (pagination?.offset !== undefined) {
    queryParams.append('offset', String(pagination.offset))
  }
  if (visibility) {
    queryParams.append('visibility', visibility)
  }
  const queryString = queryParams.toString() ? `?${queryParams.toString()}` : ''

  // Assumes backend endpoint GET /api/users/me/posts exists and returns ProfilePostsPage structure
  return apiClient<ProfilePostsPage>(`/users/me/posts${queryString}`, {
    credentials: 'include',
  })
}

/**
 * Fetches posts liked by the currently authenticated user.
 * @param pagination - Optional pagination parameters.
 */
export const getMyLikedPosts = async (pagination?: {
  limit?: number
  offset?: number
}): Promise<ProfilePostsPage> => {
  const queryParams = new URLSearchParams()
  if (pagination?.limit !== undefined) {
    queryParams.append('limit', String(pagination.limit))
  }
  if (pagination?.offset !== undefined) {
    queryParams.append('offset', String(pagination.offset))
  }
  const queryString = queryParams.toString() ? `?${queryParams.toString()}` : ''

  // Assumes backend endpoint GET /api/users/me/liked-posts exists and returns ProfilePostsPage structure
  return apiClient<ProfilePostsPage>(`/users/me/liked-posts${queryString}`, {
    credentials: 'include',
  })
}

// --- Notification Types --- //

// Type for the actor (user who performed the action)
export interface NotificationActor {
  id: string
  username: string
  name: string | null
  image: string | null
}

// Type for the related post in a notification
export interface NotificationPost {
  id: number
  title: string | null
  coverImg: string | null // Added cover image
}

// Type for a single notification item
export interface NotificationItem {
  id: number
  recipientId: string
  actorId: string | null
  type: 'like' | 'comment' | 'reply' | 'remix' | 'follow'
  postId: number | null
  commentId: number | null
  isRead: boolean
  createdAt: string // ISOStringDate
  actor: NotificationActor | null
  post: NotificationPost | null
  // comment?: { id: number; body: string }; // Optional comment snippet
}

// Structure for the paginated notifications list
export interface NotificationsPage {
  items: NotificationItem[]
  pageInfo: {
    hasNextPage: boolean
    nextOffset: number | null
  }
}

/**
 * Fetches notifications for the currently authenticated user.
 * @param pagination - Optional pagination parameters.
 */
export const getMyNotifications = async (pagination?: {
  limit?: number
  offset?: number
}): Promise<NotificationsPage> => {
  const queryParams = new URLSearchParams()
  if (pagination?.limit !== undefined) {
    queryParams.append('limit', String(pagination.limit))
  }
  if (pagination?.offset !== undefined) {
    queryParams.append('offset', String(pagination.offset))
  }
  const queryString = queryParams.toString() ? `?${queryParams.toString()}` : ''

  // Assumes backend endpoint GET /api/users/me/notifications exists
  return apiClient<NotificationsPage>(`/users/me/notifications${queryString}`, {
    credentials: 'include',
  })
}

/**
 * Marks a specific notification as read for the current user.
 * @param notificationId The ID of the notification to mark as read.
 */
export const markNotificationAsRead = async (
  notificationId: number,
): Promise<{ success: boolean; message: string }> => {
  return apiClient<{ success: boolean; message: string }>(
    `/users/me/notifications/${notificationId}/read`,
    {
      method: 'PATCH', // Use PATCH for partial updates like marking as read
      credentials: 'include',
    },
  )
}

/**
 * Marks all notifications as read for the current user.
 */
export const markAllNotificationsAsRead = async (): Promise<{
  success: boolean
  message?: string // Message might be optional on success
  error?: string // Error message on failure
}> => {
  return apiClient<{
    success: boolean
    message?: string
    error?: string
  }>('/users/me/notifications/mark-all-as-read', {
    method: 'POST',
    credentials: 'include',
  })
}

// --- VE Transaction History --- //

// Type for a single VE transaction item
export interface VeTransactionItem {
  id: number
  userId: string
  delta: number
  reason: string | null
  refId: number | null
  createdAt: string // ISO Date string
}

// Type for the paginated VE transaction response
export interface VeHistoryPage {
  items: VeTransactionItem[]
  pageInfo: {
    hasNextPage: boolean
    nextOffset: number | null
  }
}

/**
 * Fetches the current user's Vibe Energy (VE) transaction history.
 */
export async function getMyVeHistory(params: {
  limit: number
  offset: number
}): Promise<VeHistoryPage> {
  const queryParams = new URLSearchParams({
    limit: String(params.limit),
    offset: String(params.offset),
  })
  return apiClient<VeHistoryPage>(
    `/users/me/ve-transactions?${queryParams.toString()}`,
    {
      method: 'GET',
      credentials: 'include', // Required to identify the user
    },
  )
}

// --- Bookmarked Posts --- //

// Assuming the backend returns a structure similar to ProfilePostsPage
// but containing full post details needed for display cards.
// If the structure is different, define a new type.
// For now, re-using ProfilePostsPage but the items might have more fields.
// Note: The backend actually returns PostDetails[], let's define accordingly.

// Re-import PostDetails if not already imported
// import { PostDetails } from './postApi';
// Let's assume PostDetails includes necessary fields like author, etc.

// Define the response structure for bookmarked posts
export interface BookmarkedPostsPage {
  items: PostDetails[] // Use the detailed post type
  pageInfo: {
    hasNextPage: boolean
    nextOffset: number | null
  }
}

// --- Bookmarked Post Types ---

// Type for the author within a bookmarked post item
// Re-defined here for clarity, ensure it matches backend response
export interface BookmarkedPostAuthor {
  id: string
  name: string | null
  image: string | null
  username: string | null
}

// Type for a single bookmarked post item
export interface BookmarkedPostItem {
  id: number
  title: string | null
  coverImg: string | null
  createdAt: string | null // ISO string of post creation
  author: BookmarkedPostAuthor | null
  likeCount: number | null
  commentCount: number | null
  viewCount?: number | null
  remixCount?: number | null
  bookmarkedAt: string | null // ISO string of when bookmark was created
}

// Type for the pagination metadata (reusable)
export interface PaginationMeta {
  limit: number
  offset: number
  totalCount: number
  totalPages: number
  currentPage: number
}

// Type for the API response containing bookmarked posts
export interface BookmarkedPostsResponse {
  data: BookmarkedPostItem[]
  meta: PaginationMeta
}

/**
 * Fetches posts bookmarked by the currently authenticated user.
 */
export async function getMyBookmarkedPosts(params: {
  limit: number
  offset: number
}): Promise<BookmarkedPostsResponse> {
  const queryParams = new URLSearchParams()
  queryParams.set('limit', String(params.limit))
  queryParams.set('offset', String(params.offset))
  const queryString = queryParams.toString()

  return apiClient<BookmarkedPostsResponse>(
    `/users/me/bookmarks?${queryString}`,
    {
      credentials: 'include', // Endpoint requires authentication
    },
  )
}
