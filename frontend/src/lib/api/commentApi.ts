import { apiClient } from './apiClient' // Import new client and error type

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

// API_BASE_URL is now in apiClient.ts

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
  return apiClient<CommentWithAuthor[]>(`/posts/${postId}/comments`)
}

/**
 * Creates a new comment.
 */
export async function createComment(
  payload: CreateCommentPayload,
): Promise<CommentWithAuthor> {
  return apiClient<CommentWithAuthor, CreateCommentPayload>('/comments', {
    method: 'POST',
    credentials: 'include', // Required for posting comments
    body: payload,
  })
}
