'use client'

import { useSession } from '@/lib/authClient'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNowStrict } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import CommentInput from '@/components/comments/CommentInput'
import CommentItem from '@/components/comments/CommentItem'

import {
  type CommentWithAuthor,
  type CreateCommentPayload,
  createComment,
  getComments,
} from '@/lib/api/commentApi'
import {
  type PostDetails as BasePostDetails,
  type BookmarkActionResponse,
  type ToggleLikeResponse,
  bookmarkPost,
  getPostDetails,
  toggleLikePost,
  unbookmarkPost,
} from '@/lib/api/postApi'

// Extend the PostDetails type to include expected fields from the API response
interface PostDetails extends BasePostDetails {
  imagesForClient?: Array<{ id: string; url: string }>
  bodyMd?: string | null
}

// Helper to get initials from name
const getInitials = (name?: string | null) => {
  if (!name) return 'U'
  const names = name.split(' ')
  if (names.length === 1) return names[0][0]?.toUpperCase() ?? 'U'
  return (names[0][0] + (names[names.length - 1][0] || '')).toUpperCase()
}

// Type definition for the reply target state
interface CommentReplyTarget {
  id: string // ID of the comment being replied to
  authorName: string // Name of the author being replied to
}

export default function PostDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()

  let postIdString: string | undefined
  if (Array.isArray(params.postId)) {
    postIdString = params.postId[0]
  } else {
    postIdString = params.postId
  }

  const { data: session } = useSession()

  const currentUser = useMemo(() => {
    if (!session?.user) return null
    return {
      id: session.user.id,
      name: session.user.name,
      image: session.user.image ?? null,
      username: null,
    }
  }, [session])

  // Lightbox state
  const [replyTarget, setReplyTarget] = useState<CommentReplyTarget | null>(
    null,
  )
  const commentInputRef = useRef<HTMLTextAreaElement>(null)

  // Add state for current image index
  const [currentImageIndex, setCurrentImageIndex] = useState(0)

  const {
    data: post,
    isLoading: isLoadingPost,
    error: postError,
    isError: isErrorPost,
  } = useQuery<PostDetails, Error>({
    queryKey: ['post', postIdString],
    queryFn: () => {
      if (!postIdString)
        throw new Error('Post ID is missing for getPostDetails')
      return getPostDetails(postIdString)
    },
    enabled: !!postIdString,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  })

  const {
    data: comments,
    isLoading: isLoadingComments,
    error: commentsError,
  } = useQuery<CommentWithAuthor[], Error>({
    queryKey: ['comments', postIdString],
    queryFn: () => {
      if (!postIdString) throw new Error('Post ID is missing for getComments')
      return getComments(postIdString)
    },
    enabled: !!postIdString,
  })

  // Process comments for hierarchical display
  const { topLevelComments, commentsById } = useMemo(() => {
    // Using Record for better type inference
    const commentsByIdMap: Record<string, CommentWithAuthor> = {}
    const topLevelCommentsList: CommentWithAuthor[] = []

    if (!comments) {
      return {
        topLevelComments: topLevelCommentsList,
        commentsById: commentsByIdMap,
      }
    }

    for (const comment of comments) {
      // Make sure isLiked is included for each comment
      commentsByIdMap[comment.id] = {
        ...comment,
        isLiked: comment.isLiked ?? false,
        likeCount: comment.likeCount ?? 0,
        commentCount: comment.commentCount ?? 0,
      }
    }

    for (const comment of comments) {
      if (comment.parentId === null) {
        topLevelCommentsList.push(commentsByIdMap[comment.id])
      }
    }

    // Sort top-level by date
    topLevelCommentsList.sort(
      (a, b) =>
        new Date(a.createdAt || 0).getTime() -
        new Date(b.createdAt || 0).getTime(),
    )

    return {
      topLevelComments: topLevelCommentsList,
      commentsById: commentsByIdMap,
    }
  }, [comments])

  const likeMutation = useMutation<
    ToggleLikeResponse,
    Error,
    void,
    { previousPost?: PostDetails }
  >({
    mutationFn: () => {
      if (!postIdString)
        throw new Error('Post ID is missing for toggleLikePost')
      return toggleLikePost(postIdString)
    },
    onMutate: async () => {
      if (!postIdString) return
      await queryClient.cancelQueries({ queryKey: ['post', postIdString] })
      const previousPost = queryClient.getQueryData<PostDetails>([
        'post',
        postIdString,
      ])

      if (previousPost) {
        const newIsLiked = !(previousPost.isLiked ?? false)
        const currentLikeCount = previousPost.likeCount ?? 0
        const newLikeCount = newIsLiked
          ? currentLikeCount + 1
          : Math.max(0, currentLikeCount - 1)

        queryClient.setQueryData<PostDetails>(['post', postIdString], {
          ...previousPost,
          isLiked: newIsLiked,
          likeCount: newLikeCount,
        })
      }
      return { previousPost }
    },
    onSuccess: (data) => {
      if (postIdString) {
        queryClient.invalidateQueries({ queryKey: ['post', postIdString] })
      }
    },
    onError: (err, _newLikeState, context) => {
      if (context?.previousPost && postIdString) {
        queryClient.setQueryData<PostDetails>(
          ['post', postIdString],
          context.previousPost,
        )
      }
      toast.error('Failed to update like status')
      console.error('Like mutation error:', err)
    },
    onSettled: () => {
      if (postIdString) {
        queryClient.invalidateQueries({ queryKey: ['post', postIdString] })
      }
    },
  })

  const toggleBookmarkMutation = useMutation<
    BookmarkActionResponse,
    Error,
    void,
    { previousPost?: PostDetails }
  >({
    mutationFn: () => {
      if (!postIdString)
        throw new Error('Post ID is missing for bookmark action')
      if (!post)
        throw new Error('Post data is not available for bookmark action')
      if (post.isBookmarked) {
        return unbookmarkPost(postIdString)
      }
      return bookmarkPost(postIdString)
    },
    onMutate: async () => {
      if (!postIdString) return
      await queryClient.cancelQueries({ queryKey: ['post', postIdString] })
      const previousPost = queryClient.getQueryData<PostDetails>([
        'post',
        postIdString,
      ])

      if (previousPost) {
        const newIsBookmarked = !(previousPost.isBookmarked ?? false)
        const currentBookmarkCount = previousPost.bookmarkCount ?? 0
        const newBookmarkCount = newIsBookmarked
          ? currentBookmarkCount + 1
          : Math.max(0, currentBookmarkCount - 1)

        queryClient.setQueryData<PostDetails>(['post', postIdString], {
          ...previousPost,
          isBookmarked: newIsBookmarked,
          bookmarkCount: newBookmarkCount,
        })
      }
      return { previousPost }
    },
    onSuccess: (data) => {
      if (postIdString) {
        queryClient.invalidateQueries({ queryKey: ['post', postIdString] })
      }
    },
    onError: (err, _variables, context) => {
      if (context?.previousPost && postIdString) {
        queryClient.setQueryData<PostDetails>(
          ['post', postIdString],
          context.previousPost,
        )
      }
      toast.error('Failed to update bookmark')
      console.error('Bookmark mutation error:', err)
    },
    onSettled: () => {
      if (postIdString) {
        queryClient.invalidateQueries({ queryKey: ['post', postIdString] })
      }
    },
  })

  const createCommentMutation = useMutation<
    CommentWithAuthor,
    Error,
    { body: string; parentId?: string | undefined },
    { previousComments?: CommentWithAuthor[]; optimisticCommentId?: string }
  >({
    mutationFn: async ({ body, parentId }) => {
      if (!post || !post.id) throw new Error('Post not loaded')
      const payload: CreateCommentPayload = { postId: post.id, body }
      if (parentId !== undefined) {
        payload.parentId = parentId
      }
      return createComment(payload)
    },
    onMutate: async ({ parentId, body }) => {
      if (!postIdString || !currentUser || !post || !post.id) return {}

      await queryClient.cancelQueries({ queryKey: ['comments', postIdString] })
      const previousComments =
        queryClient.getQueryData<CommentWithAuthor[]>([
          'comments',
          postIdString,
        ]) || []

      const optimisticCommentId = Date.now().toString()
      const optimisticComment: CommentWithAuthor = {
        id: optimisticCommentId,
        postId: post.id,
        userId: currentUser.id,
        parentId: parentId ?? null,
        body: body,
        createdAt: new Date().toISOString(),
        author: {
          id: currentUser.id,
          name: currentUser.name,
          image: currentUser.image,
          username: currentUser.username,
        },
        likeCount: 0,
        commentCount: 0,
        isLiked: false,
      }

      queryClient.setQueryData<CommentWithAuthor[]>(
        ['comments', postIdString],
        [...previousComments, optimisticComment],
      )
      queryClient.setQueryData<PostDetails>(
        ['post', postIdString],
        (oldPost: PostDetails | undefined) => {
          if (!oldPost) return oldPost
          return { ...oldPost, commentCount: (oldPost.commentCount ?? 0) + 1 }
        },
      )

      return { previousComments, optimisticCommentId }
    },
    onError: (err, _newComment, context) => {
      if (context?.previousComments && postIdString) {
        queryClient.setQueryData<CommentWithAuthor[]>(
          ['comments', postIdString],
          context.previousComments,
        )
      }
      if (postIdString) {
        queryClient.invalidateQueries({ queryKey: ['post', postIdString] })
      }
      toast.error('Failed to post comment')
      console.error('Create comment error:', err)
    },
    onSuccess: (newlyCreatedComment, _variables, context) => {
      queryClient.setQueryData<CommentWithAuthor[]>(
        ['comments', postIdString],
        (oldComments) => {
          let updatedComments = oldComments || []
          if (context?.optimisticCommentId) {
            updatedComments = updatedComments.filter(
              (c) => c.id !== context.optimisticCommentId,
            )
          }
          const commentExists = updatedComments.some(
            (c) => c.id === newlyCreatedComment.id,
          )
          if (!commentExists) {
            updatedComments.push(newlyCreatedComment)
          }
          return updatedComments.sort(
            (a, b) =>
              new Date(a.createdAt || '0').getTime() -
              new Date(b.createdAt || '0').getTime(),
          )
        },
      )
      if (postIdString) {
        queryClient.invalidateQueries({ queryKey: ['post', postIdString] })
      }
    },
    onSettled: () => {
      if (postIdString) {
        queryClient.invalidateQueries({ queryKey: ['post', postIdString] })
        queryClient.invalidateQueries({ queryKey: ['comments', postIdString] })
      }
    },
  })

  const handleCommentSubmit = useCallback(
    async (body: string) => {
      if (!post || !currentUser) {
        toast.error('Cannot submit comment')
        return
      }
      if (!body.trim()) {
        return
      }

      const parentId = replyTarget ? replyTarget.id : undefined

      await createCommentMutation.mutate(
        { body, parentId },
        {
          onSuccess: () => {
            setReplyTarget(null)
          },
        },
      )
    },
    [post, currentUser, replyTarget, createCommentMutation],
  )

  const cancelReply = useCallback(() => {
    setReplyTarget(null)
  }, [])

  const handleShareClick = () => {
    const url = window.location.href
    navigator.clipboard
      .writeText(url)
      .then(() => {
        toast.success('Link copied to clipboard!')
      })
      .catch((err) => {
        console.error('Failed to copy link: ', err)
        toast.error('Failed to copy link')
      })
  }

  const handleReplyClick = useCallback(
    (commentId: string, authorName: string) => {
      if (!currentUser) {
        // Remove toast - rely on UI to handle this case (Sign in button is shown)
        return
      }
      setReplyTarget({ id: commentId, authorName })
      setTimeout(() => {
        commentInputRef.current?.focus()
        commentInputRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      }, 50)
    },
    [currentUser],
  )

  // Handle image navigation
  const handlePrevImage = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      const images = post?.imagesForClient
      if (!images || images.length <= 1) return
      setCurrentImageIndex((prev) =>
        prev === 0 ? images.length - 1 : prev - 1,
      )
    },
    [post],
  )

  const handleNextImage = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      const images = post?.imagesForClient
      if (!images || images.length <= 1) return
      setCurrentImageIndex((prev) =>
        prev === images.length - 1 ? 0 : prev + 1,
      )
    },
    [post],
  )

  const handleDotClick = useCallback(
    (index: number) => {
      const images = post?.imagesForClient
      if (!images || index >= images.length) return
      setCurrentImageIndex(index)
    },
    [post],
  )

  // Get current image URL
  const currentImageUrl = useMemo(() => {
    if (!post) return 'https://via.placeholder.com/800x600'

    // Use imagesForClient array if available
    const images = post.imagesForClient
    if (images && images.length > 0) {
      return images[currentImageIndex]?.url || post.coverImg
    }

    // Fallback to coverImg
    return post.coverImg || 'https://via.placeholder.com/800x600'
  }, [post, currentImageIndex])

  // Total image count
  const totalImages = useMemo(() => {
    return post?.imagesForClient?.length || 0
  }, [post])

  // Error states
  if (!postIdString) {
    return (
      <div className="max-w-[1000px] mx-auto p-4">
        <div className="bg-white rounded-[12px] p-4 shadow-sm">
          <h2 className="text-[17px] font-medium">Error</h2>
          <p className="text-gray-500 mt-2 text-[15px]">Content not found</p>
        </div>
      </div>
    )
  }

  if (isLoadingPost && !post) {
    return (
      <div className="max-w-[1000px] mx-auto p-4">
        <div className="flex bg-white rounded-[12px] shadow-sm overflow-hidden">
          <Skeleton className="min-w-[350px] h-auto aspect-square" />
          <div className="p-4 flex-1">
            <div className="flex items-center">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="ml-3 flex-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16 mt-1" />
              </div>
              <Skeleton className="h-8 w-20 rounded-full" />
            </div>
            <Skeleton className="mt-4 h-6 w-full" />
            <Skeleton className="mt-2 h-6 w-2/3" />
          </div>
        </div>
      </div>
    )
  }

  if (isErrorPost || !post) {
    return (
      <div className="max-w-[1000px] mx-auto p-4">
        <div className="bg-white rounded-[12px] p-4 shadow-sm">
          <h2 className="text-[17px] font-medium mb-2">Error Loading Post</h2>
          <p className="text-gray-500 mb-4 text-[15px]">
            {postError?.message || 'An unexpected error occurred'}
          </p>
          <Button
            onClick={() => router.push('/')}
            className="rounded-full text-[14px]"
            size="sm"
          >
            Go Home
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Main post container */}
      <div className="bg-white rounded-[32px] shadow-sm overflow-hidden">
        <div className="flex flex-col md:flex-row h-[80vh]">
          {/* Image section */}
          <div className="md:w-[60%] h-full relative overflow-hidden rounded-l-[32px] bg-[#f5f5f7]">
            {/* Heavily blurred background image */}
            {currentImageUrl && (
              <div
                className="absolute inset-0 z-0 bg-cover bg-center opacity-50 scale-125"
                style={{
                  backgroundImage: `url(${currentImageUrl})`,
                  filter: 'blur(80px) saturate(120%)',
                }}
              />
            )}

            {/* Main image container with centered content */}
            <div className="relative z-10 w-full h-full flex items-center justify-center p-8">
              {currentImageUrl && (
                <img
                  src={currentImageUrl}
                  alt={post?.title || 'Post image'}
                  className="max-w-full max-h-full object-contain rounded-xl shadow-[0_4px_30px_rgba(0,0,0,0.1)]"
                />
              )}
            </div>

            {/* Image navigation */}
            {totalImages > 1 && (
              <>
                {/* Image counter - top right with improved styling */}
                <div className="absolute top-6 right-6 z-20 px-3 py-1 rounded-full bg-black/25 backdrop-blur-sm text-white text-sm shadow-sm">
                  {currentImageIndex + 1}/{totalImages}
                </div>

                {/* Navigation arrows - more subtle styling */}
                <div className="absolute inset-0 z-20 opacity-0 hover:opacity-100 transition-opacity duration-200">
                  <div className="absolute inset-0 flex items-center justify-between px-8">
                    <button
                      type="button"
                      className="w-10 h-10 rounded-full bg-black/25 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/40 transition-colors focus:outline-none shadow-lg"
                      onClick={handlePrevImage}
                      aria-label="Previous image"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      className="w-10 h-10 rounded-full bg-black/25 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/40 transition-colors focus:outline-none shadow-lg"
                      onClick={handleNextImage}
                      aria-label="Next image"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {/* Bottom dots - more subtle styling */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-black/25 backdrop-blur-sm">
                  {post?.imagesForClient?.map((img, i) => (
                    <button
                      key={`image-dot-${img.id || i}`}
                      type="button"
                      className={`h-1.5 rounded-full transition-all ${
                        i === currentImageIndex
                          ? 'w-4 bg-white'
                          : 'w-1.5 bg-white/60 hover:bg-white/80'
                      }`}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDotClick(i)
                      }}
                      aria-label={`View image ${i + 1}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Content section */}
          <div
            className="flex flex-col flex-1 h-full md:w-[40%] bg-white"
            style={{ borderRadius: '0 32px 32px 0' }}
          >
            {/* Author info section - fixed */}
            <div className="p-5 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center flex-1">
                  <Avatar className="h-9 w-9 rounded-full">
                    <AvatarImage
                      src={post.author?.image ?? undefined}
                      alt={post.author?.name ?? 'Author'}
                    />
                    <AvatarFallback>
                      {getInitials(post.author?.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="ml-2.5 flex-1 min-w-0">
                    <div className="font-medium text-[15px] truncate">
                      {post.author?.name || 'Anonymous'}
                    </div>
                  </div>
                </div>
                <Button variant="default" size="sm" className="rounded-full">
                  Follow
                </Button>
              </div>
            </div>

            {/* Scrollable content area - both post content and comments */}
            <div className="flex-1 overflow-y-auto">
              {/* Post content */}
              <div className="px-5 pt-4 pb-5 border-b border-gray-100">
                {post.title && (
                  <h1 className="text-xl font-semibold mb-3">{post.title}</h1>
                )}

                {post.bodyMd && post.bodyMd.trim() !== '' ? (
                  <div className="text-[15px] leading-relaxed text-gray-800 whitespace-pre-line mb-4">
                    {post.bodyMd}
                  </div>
                ) : null}

                {post.tags && post.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {post.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[14px] text-muted-foreground cursor-pointer hover:text-primary font-medium"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="text-[13px] text-gray-500 mt-3">
                  {post.createdAt &&
                    formatDistanceToNowStrict(new Date(post.createdAt), {
                      addSuffix: true,
                    })}
                </div>
              </div>

              {/* Comments section - in the same scrollable area */}
              <div className="p-5">
                {comments && comments.length > 0 ? (
                  <div className="space-y-1">
                    {topLevelComments.map((comment) => (
                      <CommentItem
                        key={comment.id}
                        comment={comment}
                        allCommentsById={commentsById}
                        nestingLevel={0}
                        currentUserId={currentUser?.id}
                        onReply={handleReplyClick}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-5">
                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-3">
                      <span className="text-3xl text-gray-300">:)</span>
                    </div>
                    <p className="text-gray-400 text-[14px]">No comments yet</p>
                  </div>
                )}
              </div>
            </div>

            {/* Fixed bottom bar */}
            <div className="border-t border-gray-100 bg-white">
              <div className="p-5">
                {/* Comment input */}
                {currentUser ? (
                  <CommentInput
                    ref={commentInputRef}
                    onSubmit={handleCommentSubmit}
                    currentUser={currentUser}
                    isLoading={createCommentMutation.isPending}
                    replyTarget={
                      replyTarget
                        ? {
                            id: replyTarget.id,
                            authorName: replyTarget.authorName,
                          }
                        : null
                    }
                    onCancelReply={cancelReply}
                    likeCount={post.likeCount || 0}
                    commentCount={post.commentCount || 0}
                    onLike={() => likeMutation.mutate()}
                    onShare={handleShareClick}
                    isLiked={post.isLiked}
                    onBookmark={() => toggleBookmarkMutation.mutate()}
                    isBookmarked={post.isBookmarked}
                  />
                ) : (
                  <div className="bg-gray-50 rounded-2xl px-5 py-4 text-center">
                    <p className="text-gray-500 text-sm mb-2">
                      Sign in to join the conversation
                    </p>
                    <Button
                      variant="default"
                      size="sm"
                      className="rounded-full px-4"
                      onClick={() => {
                        // Handle login
                        router.push('/login')
                      }}
                    >
                      Sign in
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
