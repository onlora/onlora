import type { PostVisibility } from '@/components/jam/PublishSheet' // Assuming this type is 'public' | 'private'
import type { ApiErrorResponse } from './jamApi' // Re-use error structure if applicable

export interface CreatePostPayload {
  title: string
  description?: string
  tags?: string[]
  visibility: PostVisibility
  imageIds: number[]
  jamId?: number // Optional: to link posts to the jam session they originated from
}

export interface CreatePostResponse {
  postId: number
  // Potentially other fields the backend might return upon successful creation
}

export async function createPost(
  payload: CreatePostPayload,
): Promise<CreatePostResponse> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api'
  const response = await fetch(`${apiUrl}/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    let errorData: ApiErrorResponse
    try {
      errorData = await response.json()
    } catch (e) {
      // If response is not JSON, use status text or a generic message
      throw new Error(
        `Failed to create post: ${response.status} ${response.statusText || 'Server error'}`,
      )
    }
    // Throw an error that includes backend-provided details if available
    const error = new Error(
      errorData.message ||
        `Failed to create post: ${response.status} ${errorData.code || 'Unknown error'}`,
    ) as Error & Partial<ApiErrorResponse> // Augment error type
    error.code = errorData.code
    throw error
  }

  return response.json() as Promise<CreatePostResponse>
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
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api'
  const response = await fetch(`${apiUrl}/posts/${postId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Send cookies for potential auth checks (e.g., private posts)
  })

  if (!response.ok) {
    let errorData: ApiErrorResponse
    try {
      errorData = await response.json()
    } catch (e) {
      throw new Error(
        `Failed to fetch post details: ${response.status} ${response.statusText || 'Server error'}`,
      )
    }
    const error = new Error(
      errorData.message ||
        `Failed to fetch post details: ${response.status} ${errorData.code || 'Unknown error'}`,
    ) as Error & Partial<ApiErrorResponse>
    error.code = errorData.code
    throw error
  }

  return response.json() as Promise<PostDetails>
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
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api'
  const response = await fetch(`${apiUrl}/posts/${postId}/like`, {
    method: 'POST',
    headers: {
      // Content-Type might not be strictly needed for a POST without a body,
      // but can be included. Authorization is handled by credentials: 'include' (cookies).
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    // No body needed for this toggle endpoint
  })

  if (!response.ok) {
    let errorData: ApiErrorResponse
    try {
      errorData = await response.json()
    } catch (e) {
      throw new Error(
        `Failed to toggle like: ${response.status} ${response.statusText || 'Server error'}`,
      )
    }
    const error = new Error(
      errorData.message ||
        `Failed to toggle like: ${response.status} ${errorData.code || 'Unknown error'}`,
    ) as Error & Partial<ApiErrorResponse>
    error.code = errorData.code
    throw error
  }

  return response.json() as Promise<ToggleLikeResponse>
}
