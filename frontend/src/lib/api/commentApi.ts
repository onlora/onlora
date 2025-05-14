import { apiClient } from './apiClient' // Import new client and error type

// --- Types --- //

// Matches the author structure returned by the backend GET /posts/:id/comments
export interface CommentAuthor {
  id: string
  name: string | null
  image: string | null // Avatar URL
  username: string | null // Added username
}

// Matches the comment structure returned by the backend
export interface CommentWithAuthor {
  id: string
  postId: string
  userId: string | null
  parentId: string | null
  body: string
  createdAt: string | null // Date comes as string
  author: CommentAuthor | null // User who wrote the comment
  likeCount: number | null
  commentCount: number | null
  isLiked?: boolean
  // Add other fields if backend returns them (e.g., likeCount for comments)
}

// Payload for creating a new comment
export interface CreateCommentPayload {
  postId: string
  body: string
  parentId?: string // For replies
}

// Response type for like actions
export interface ToggleCommentLikeResponse {
  liked: boolean
  likeCount: number | null
}

// API_BASE_URL is now in apiClient.ts

// --- API Functions --- //

/**
 * Fetches comments for a specific post.
 */
export async function getComments(
  postId: string,
): Promise<CommentWithAuthor[]> {
  if (!postId) {
    throw new Error('Invalid Post ID provided.')
  }
  return apiClient<CommentWithAuthor[]>(`/posts/${postId}/comments`, {
    credentials: 'include', // Include credentials to get proper isLiked status
  })
}

/**
 * Creates a new comment.
 */
export const createComment = async (
  payload: CreateCommentPayload,
): Promise<CommentWithAuthor> => {
  return apiClient<CommentWithAuthor, CreateCommentPayload>('/comments', {
    method: 'POST',
    body: payload,
    credentials: 'include',
  })
}

/**
 * Toggles the like status of a comment
 */
export const toggleCommentLike = async (
  commentId: string,
): Promise<ToggleCommentLikeResponse> => {
  if (!commentId) {
    throw new Error('Invalid Comment ID provided.')
  }
  return apiClient<ToggleCommentLikeResponse>(`/comments/${commentId}/like`, {
    method: 'POST',
    credentials: 'include',
  })
}
