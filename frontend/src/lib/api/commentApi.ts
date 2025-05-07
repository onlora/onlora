import type { ApiErrorResponse } from './jamApi' // Re-use error structure

// --- Types --- //

// Matches the author structure returned by the backend GET /posts/:id/comments
export interface CommentAuthor {
  id: string
  name: string | null
  image: string | null // Avatar URL
}

// Matches the comment structure returned by the backend
export interface CommentWithAuthor {
  id: number
  postId: number
  userId: string | null
  parentId: number | null
  body: string
  createdAt: string | null // Date comes as string
  author: CommentAuthor | null // User who wrote the comment
  // Add other fields if backend returns them (e.g., likeCount for comments)
}

// Payload for creating a new comment
export interface CreateCommentPayload {
  postId: number
  body: string
  parentId?: number // For replies
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api'

// --- API Functions --- //

/**
 * Fetches comments for a specific post.
 */
export async function getComments(
  postId: string,
): Promise<CommentWithAuthor[]> {
  if (!postId || Number.isNaN(Number(postId))) {
    throw new Error('Invalid Post ID provided.')
  }
  const response = await fetch(`${API_BASE_URL}/posts/${postId}/comments`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    // No credentials needed if comments are public
    // credentials: 'include',
  })

  if (!response.ok) {
    // Handle errors similar to other API calls
    let errorData: ApiErrorResponse
    try {
      errorData = await response.json()
    } catch (e) {
      throw new Error(
        `Failed to fetch comments: ${response.status} ${response.statusText || 'Server error'}`,
      )
    }
    const error = new Error(
      errorData.message || `Failed to fetch comments: ${response.status}`,
    ) as Error & Partial<ApiErrorResponse>
    error.code = errorData.code
    throw error
  }
  return response.json() as Promise<CommentWithAuthor[]>
}

/**
 * Creates a new comment.
 */
export async function createComment(
  payload: CreateCommentPayload,
): Promise<CommentWithAuthor> {
  const response = await fetch(`${API_BASE_URL}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Required for posting comments
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    // Handle errors
    let errorData: ApiErrorResponse
    try {
      errorData = await response.json()
    } catch (e) {
      throw new Error(
        `Failed to create comment: ${response.status} ${response.statusText || 'Server error'}`,
      )
    }
    const error = new Error(
      errorData.message || `Failed to create comment: ${response.status}`,
    ) as Error & Partial<ApiErrorResponse>
    error.code = errorData.code
    throw error
  }
  // Backend returns the created comment, potentially with author info added
  return response.json() as Promise<CommentWithAuthor>
}
