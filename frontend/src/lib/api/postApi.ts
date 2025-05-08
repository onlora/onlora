import type { PostVisibility } from '@/components/jam/PublishSheet' // Assuming this type is 'public' | 'private'
import { apiClient } from './apiClient' // Import new client and error type

export interface CreatePostPayload {
  title: string
  description?: string
  tags?: string[]
  visibility: PostVisibility
  imageIds: number[]
  jamId?: number // Optional: to link posts to the jam session they originated from
  // Remix fields
  parentPostId?: number
  rootPostId?: number
  generation?: number
}

export interface CreatePostResponse {
  postId: number
  // Potentially other fields the backend might return upon successful creation
}

export async function createPost(
  payload: CreatePostPayload,
): Promise<CreatePostResponse> {
  return apiClient<CreatePostResponse, CreatePostPayload>('/posts', {
    method: 'POST',
    credentials: 'include', // Keep credentials if needed for the endpoint
    body: payload,
  })
}

// Type definition for the response of GET /api/posts/:postId
// Based on the backend query structure in postRoutes.ts
export interface PostAuthor {
  id: string
  name: string | null
  image: string | null // Avatar URL
  username?: string // Added optional username for authors
}

export interface PostImage {
  id: number
  url: string
}

export interface PostDetails {
  id: number
  title: string | null
  description: string | null // This is bodyMd from backend
  tags: string[] | null
  visibility: 'public' | 'private' | null
  coverImg: string | null
  createdAt: string | null // Date comes as string typically
  authorId: string | null // ID of the author user object
  likeCount: number | null
  commentCount: number | null
  remixCount: number | null
  viewCount?: number | null // viewCount is correctly here
  bookmarkCount?: number | null // Added bookmarkCount (optional for safety)
  parentPostId: number | null // ID of the parent post, if this is a remix
  rootPostId: number | null
  generation: number | null
  author: PostAuthor | null // The author object
  images: PostImage[] // Array of images associated with the post
  isLiked?: boolean // Whether the current user has liked this post
  isBookmarked: boolean // ADDED: Whether the current user has bookmarked this post
  parentPost?: {
    // This is where parentPost should be
    id: number
    title: string | null
    author: {
      id: string
      username: string
      name: string | null
    } | null
  } | null
}

/**
 * Fetches details for a single post.
 * Handles potential public/private visibility on the backend.
 */
export async function getPostDetails(postId: string): Promise<PostDetails> {
  if (!postId || Number.isNaN(Number(postId))) {
    throw new Error('Invalid Post ID provided.')
  }
  return apiClient<PostDetails>(`/posts/${postId}`, {
    credentials: 'include',
  })
}

// --- Like/Unlike Post --- //

// Type for the response of the like/unlike endpoint
export interface ToggleLikeResponse {
  didLike: boolean // True if the user now likes the post, false if they unliked it
  likeCount: number | null // The new like count
}

/**
 * Sends a request to like or unlike a post.
 */
export async function toggleLikePost(
  postId: string,
): Promise<ToggleLikeResponse> {
  if (!postId || Number.isNaN(Number(postId))) {
    throw new Error('Invalid Post ID provided.')
  }
  return apiClient<ToggleLikeResponse>(`/posts/${postId}/like`, {
    method: 'POST',
    credentials: 'include',
  })
}

// --- Bookmark Post --- //

// Response type for bookmark toggle
export interface ToggleBookmarkResponse {
  didBookmark: boolean
  bookmarkCount: number | null // Updated count
}

/**
 * Toggles the bookmark status for a post.
 */
export async function toggleBookmarkPost(
  postId: string,
): Promise<ToggleBookmarkResponse> {
  if (!postId || Number.isNaN(Number(postId))) {
    throw new Error('Invalid Post ID provided.')
  }
  return apiClient<ToggleBookmarkResponse>(`/posts/${postId}/bookmark`, {
    method: 'POST',
    credentials: 'include',
  })
}

// --- Get Post Clone Info (for Remix) --- //

export interface PostCloneInfo {
  title: string | undefined // Updated to match backend response
  tags: string[] | undefined
  coverImgUrl: string | undefined
  parentPostId: number
  rootPostId: number
  generation: number
}

/**
 * Fetches information needed to start remixing a post.
 */
export async function getPostCloneInfo(postId: string): Promise<PostCloneInfo> {
  if (!postId || Number.isNaN(Number(postId))) {
    throw new Error('Invalid Post ID provided for cloning.')
  }
  return apiClient<PostCloneInfo>(`/posts/${postId}/clone`, {
    credentials: 'include',
  })
}

// --- Delete Post --- //
export async function deleteMyPost(postId: string): Promise<void> {
  if (!postId || Number.isNaN(Number(postId))) {
    throw new Error('Invalid Post ID provided for deletion.')
  }
  // Backend should handle auth and ownership
  return apiClient<void>(`/posts/${postId}`, {
    method: 'DELETE',
    credentials: 'include',
  })
}

// --- Update Post --- //
export interface UpdatePostPayload {
  title?: string
  description?: string | null
  tags?: string[] | null
  visibility?: 'public' | 'private'
}

// Assuming PostDetails is the response type for an updated post as well
export async function updateMyPost(
  postId: string,
  payload: UpdatePostPayload,
): Promise<PostDetails> {
  if (!postId || Number.isNaN(Number(postId))) {
    throw new Error('Invalid Post ID provided for update.')
  }
  if (Object.keys(payload).length === 0) {
    throw new Error('No update data provided.')
  }
  // Backend should handle auth and ownership
  return apiClient<PostDetails, UpdatePostPayload>(`/posts/${postId}`, {
    method: 'PATCH',
    credentials: 'include',
    body: payload,
  })
}
