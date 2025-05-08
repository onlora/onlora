import { apiClient } from './apiClient'

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
  return apiClient<UserProfile>('/users/me/profile', {
    method: 'PATCH',
    body: payload as Record<string, unknown>, // Use unknown instead of any
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
  })
}

/**
 * Unfollows a target user.
 */
export const unfollowUser = async (
  targetUserId: string,
): Promise<FollowResponse> => {
  return apiClient<FollowResponse>(`/users/${targetUserId}/unfollow`, {
    method: 'POST',
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
  return apiClient<ProfilePostsPage>(`/users/me/posts${queryString}`)
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
      method: 'PATCH',
      credentials: 'include',
    },
  )
}

/**
 * Marks all notifications as read for the current user.
 */
export const markAllNotificationsAsRead = async (): Promise<{
  success: boolean
  message: string
  updatedCount: number
}> => {
  return apiClient<{
    success: boolean
    message: string
    updatedCount: number
  }>('/users/me/notifications/read-all', {
    method: 'PATCH',
    credentials: 'include',
  })
}

// export async function followUser(targetUserId: string): Promise<{ success: boolean; message: string }> { ... }
// export async function unfollowUser(targetUserId: string): Promise<{ success: boolean; message: string }> { ... }
