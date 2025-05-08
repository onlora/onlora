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
}

export interface PostImage {
  id: number
  url: string
}

export interface PostDetails {
  id: number
  title: string | null
  description: string | null
  tags: string[] | null
  visibility: 'public' | 'private' | null
  coverImg: string | null
  createdAt: string | null // Date comes as string typically
  authorId: string | null
  likeCount: number | null
  commentCount: number | null
  remixCount: number | null
  parentPostId: number | null
  rootPostId: number | null
  generation: number | null
  author: PostAuthor | null
  images: PostImage[] // Assuming images are always returned as an array, even if empty
  isLiked?: boolean
  viewCount?: number
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

// --- Get Post Clone Info (for Remix) --- //

export interface PostCloneInfo {
  prompt: string | null
  model: string | null
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
