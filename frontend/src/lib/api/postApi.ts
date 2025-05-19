import type { PostVisibility } from '@/components/jam/PublishSheet' // Assuming this type is 'public' | 'private'
import { apiClient } from './apiClient' // Import new client and error type

// Image data for post creation
export interface PostImageData {
  id?: string
  data: string // base64 data or URL
  altText?: string
  model?: string
}

export interface CreatePostPayload {
  title: string
  description?: string
  tags?: string[]
  visibility: PostVisibility
  images: PostImageData[] // New format: array of image data objects
  jamId?: string // Changed from number to string to match UUID format
  // Remix fields
  parentPostId?: string
  rootPostId?: string
  generation?: number
}

export interface CreatePostResponse {
  postId: string
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
  isFollowing?: boolean // Added optional field to indicate if the current user is following this author
}

export interface PostImage {
  id: string
  url: string
}

export interface PostDetails {
  id: string
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
  viewCount?: number | null
  bookmarkCount?: number | null
  parentPostId: string | null
  rootPostId: string | null
  generation: number | null
  author: PostAuthor | null
  images: PostImage[]
  isLiked?: boolean
  isBookmarked?: boolean // Ensure this is not optional if backend always sends it
  parentPost?: {
    id: string
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
  if (!postId) {
    throw new Error('Invalid Post ID provided.')
  }
  return apiClient<PostDetails>(`/posts/${postId}`, {
    credentials: 'include',
  })
}

// --- Like/Unlike Post --- //

// Type for the response of the like/unlike endpoint
export interface ToggleLikeResponse {
  liked: boolean // Changed from didLike to match backend more closely if it returns 'liked'
  likeCount: number | null
}

/**
 * Sends a request to like or unlike a post.
 */
export async function toggleLikePost(
  postId: string,
): Promise<ToggleLikeResponse> {
  if (!postId) {
    throw new Error('Invalid Post ID provided.')
  }
  return apiClient<ToggleLikeResponse>(`/posts/${postId}/like`, {
    method: 'POST',
    credentials: 'include',
  })
}

// --- Bookmark/Unbookmark Post --- //

// Response type for bookmark actions
export interface BookmarkActionResponse {
  bookmarked: boolean // True if the post is now bookmarked by the user
  bookmarkCount: number | null // The new bookmark count of the post
}

/**
 * Bookmarks a post.
 */
export async function bookmarkPost(
  postId: string,
): Promise<BookmarkActionResponse> {
  if (!postId) {
    throw new Error('Invalid Post ID provided for bookmarking.')
  }
  return apiClient<BookmarkActionResponse>(`/posts/${postId}/bookmark`, {
    method: 'POST',
    credentials: 'include',
  })
}

/**
 * Unbookmarks a post.
 */
export async function unbookmarkPost(
  postId: string,
): Promise<BookmarkActionResponse> {
  if (!postId) {
    throw new Error('Invalid Post ID provided for unbookmarking.')
  }
  return apiClient<BookmarkActionResponse>(`/posts/${postId}/bookmark`, {
    method: 'DELETE',
    credentials: 'include',
  })
}

// --- Get Post Clone Info (for Remix) --- //

export interface PostCloneInfo {
  title: string | undefined // Updated to match backend response
  tags: string[] | undefined
  coverImgUrl: string | undefined
  parentPostId: string
  rootPostId: string
  generation: number
}

/**
 * Fetches information needed to start remixing a post.
 */
export async function getPostCloneInfo(postId: string): Promise<PostCloneInfo> {
  if (!postId) {
    throw new Error('Invalid Post ID provided for cloning.')
  }
  return apiClient<PostCloneInfo>(`/posts/${postId}/clone`, {
    credentials: 'include',
  })
}

// --- Delete Post --- //
export async function deleteMyPost(postId: string): Promise<void> {
  if (!postId) {
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
  if (!postId) {
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

// --- Remix Tree --- //

export interface RemixTreeNode {
  id: string
  title: string | null
  author: PostAuthor | null // Re-use PostAuthor type
  parentId: string | null
  coverImg: string | null
  createdAt: string | null // ISO Date string
  remixes: RemixTreeNode[] // Recursive definition for children
}

export interface RemixTreeResponse {
  currentPostId: string
  lineage: RemixTreeNode[] // Path from root to currentPost's parent
  tree: RemixTreeNode // The current post as the root of its own remix sub-tree
}

/**
 * Fetches the remix tree (lineage and descendants) for a given post.
 */
export async function getRemixTree(postId: string): Promise<RemixTreeResponse> {
  if (!postId) {
    throw new Error('Invalid Post ID provided for fetching remix tree.')
  }
  // Assuming this endpoint might require authentication to see full details
  // or based on post visibility, so include credentials.
  return apiClient<RemixTreeResponse>(`/posts/${postId}/remix-tree`, {
    credentials: 'include',
  })
}

// --- Link Lens Post --- //
export interface LinkLensPostPayload {
  postId: string
  lensPostId: string
  lensContentUri: string
  lensTransactionHash: string
  lensAccountId: string
}

export interface LinkLensPostResponse {
  success: boolean
}

export async function linkLensPost(
  payload: LinkLensPostPayload,
): Promise<LinkLensPostResponse> {
  return apiClient<LinkLensPostResponse, LinkLensPostPayload>(
    '/posts/create-and-link-lens',
    {
      method: 'POST',
      credentials: 'include',
      body: payload,
    },
  )
}

// --- Prepare Lens Metadata --- //
export interface PrepareLensMetadataPayload {
  postId: string
  title: string
  description?: string
  images: Array<{
    data: string // base64 data or URL
    altText?: string
  }>
}

export interface PrepareLensMetadataResponse {
  contentUri: string
}

export async function prepareLensMetadata(
  payload: PrepareLensMetadataPayload,
): Promise<PrepareLensMetadataResponse> {
  return apiClient<PrepareLensMetadataResponse, PrepareLensMetadataPayload>(
    '/posts/prepare-lens-metadata',
    {
      method: 'POST',
      credentials: 'include',
      body: payload,
    },
  )
}
