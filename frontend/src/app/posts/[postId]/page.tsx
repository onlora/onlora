'use client'

import type { MessageImage } from '@/lib/api/jamApi'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNowStrict } from 'date-fns'
import {
  Bookmark,
  Eye,
  Heart,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Repeat,
  Share2,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'

import CommentInput from '@/components/comments/CommentInput'
import CommentItem from '@/components/comments/CommentItem'
import { ImageLightbox } from '@/components/jam/ImageLightbox'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'

import {
  type CommentWithAuthor,
  type CreateCommentPayload,
  createComment,
  getComments,
} from '@/lib/api/commentApi'
import {
  type PostDetails,
  type ToggleLikeResponse,
  getPostDetails,
  toggleLikePost,
} from '@/lib/api/postApi'

// Helper to get initials from name
const getInitials = (name?: string | null) => {
  if (!name) return 'U'
  const names = name.split(' ')
  if (names.length === 1) return names[0][0]?.toUpperCase() ?? 'U'
  return (names[0][0] + (names[names.length - 1][0] || '')).toUpperCase()
}

// Type definition for the reply target state
interface CommentReplyTarget {
  id: number // ID of the comment being replied to
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

  const [currentUser, setCurrentUser] = useState<{
    id: string
    name: string | null
    image: string | null
  } | null>(null)

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [replyTarget, setReplyTarget] = useState<CommentReplyTarget | null>(
    null,
  )
  const commentInputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setTimeout(() => {
      setCurrentUser({
        id: 'clxkarzq7000008l3gq5f4z8y', // Example User ID
        name: 'Demo User',
        image: 'https://avatar.vercel.sh/demo-user.png',
      })
    }, 500)
  }, [])

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
    // Using Record for better type inference with numeric keys
    const commentsByIdMap: Record<number, CommentWithAuthor> = {}
    const topLevelCommentsList: CommentWithAuthor[] = []

    if (!comments) {
      return {
        topLevelComments: topLevelCommentsList,
        commentsById: commentsByIdMap,
      }
    }

    for (const comment of comments) {
      commentsByIdMap[comment.id] = { ...comment }
    }

    for (const comment of comments) {
      if (comment.parentId === null) {
        topLevelCommentsList.push(commentsByIdMap[comment.id])
      }
      // Note: We are NOT building a nested children array here.
      // CommentItem will look up children using commentsByIdMap and comment.id
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
    onSuccess: (data, _variables, context) => {
      if (postIdString) {
        queryClient.invalidateQueries({ queryKey: ['post', postIdString] })
      }
      toast.success(data.didLike ? 'Post liked!' : 'Post unliked!')
    },
    onError: (err, _newLikeState, context) => {
      if (context?.previousPost && postIdString) {
        queryClient.setQueryData<PostDetails>(
          ['post', postIdString],
          context.previousPost,
        )
      }
      toast.error('Failed to update like status. Please try again.')
      console.error('Like mutation error:', err)
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
    { body: string; parentId?: number | undefined },
    { previousComments?: CommentWithAuthor[]; optimisticCommentId?: number }
  >({
    mutationFn: async ({
      body,
      parentId,
    }: { body: string; parentId?: number | undefined }) => {
      if (!post || !post.id) throw new Error('Post not loaded')
      const payload: CreateCommentPayload = { postId: Number(post.id), body }
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

      const optimisticCommentId = Date.now()
      const optimisticComment: CommentWithAuthor = {
        id: optimisticCommentId,
        postId: Number(post.id),
        userId: currentUser.id,
        parentId: parentId ?? null,
        body: body,
        createdAt: new Date().toISOString(),
        author: {
          id: currentUser.id,
          name: currentUser.name,
          image: currentUser.image,
        },
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
      toast.error('Failed to post comment. Please try again.')
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
      toast.success('Comment posted!')
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
        toast.error('Cannot submit comment.')
        return
      }
      if (!body.trim()) {
        toast.error('Comment cannot be empty.')
        return
      }

      const parentId: number | undefined = replyTarget
        ? replyTarget.id
        : undefined

      await createCommentMutation.mutate(
        { body, parentId },
        {
          onSuccess: () => {
            setReplyTarget(null)
          },
          onError: () => {
            // Maybe clear reply target even on error?
          },
        },
      )
    },
    [post, currentUser, replyTarget, createCommentMutation],
  )

  const cancelReply = useCallback(() => {
    setReplyTarget(null)
  }, [])

  const handleRemixClick = async () => {
    if (!postIdString) return
    router.push(`/jam/new?remixSourcePostId=${postIdString}`)
  }

  const handleShareClick = () => {
    const url = window.location.href
    navigator.clipboard
      .writeText(url)
      .then(() => {
        toast.success('Link copied to clipboard!')
      })
      .catch((err) => {
        console.error('Failed to copy link: ', err)
        toast.error('Failed to copy link.')
      })
  }

  const handleBookmarkClick = () => {
    toast.info('Bookmark feature coming soon!')
  }

  const handleReplyClick = useCallback(
    (commentId: number, authorName: string) => {
      if (!currentUser) {
        toast.error('Please log in to reply.')
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

  if (!postIdString) {
    return (
      <div className="container mx-auto max-w-3xl p-4">
        <Card>
          <CardHeader>
            <CardTitle>Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Post ID is missing. Cannot display post details.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isLoadingPost && !post) {
    return (
      <div className="container mx-auto max-w-3xl p-4">
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-6 w-3/4 mt-2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-4 w-full mt-4" />
            <Skeleton className="h-4 w-3/4 mt-2" />
            <div className="flex items-center justify-between mt-4">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isErrorPost || !post) {
    // Check !post again in case error occurred but post data is stale
    return (
      <div className="container mx-auto max-w-3xl p-4">
        <Card>
          <CardHeader>
            <CardTitle>Error Loading Post</CardTitle>
          </CardHeader>
          <CardContent>
            <p>
              {postError?.message ||
                'An unexpected error occurred while fetching the post.'}
            </p>
            <Button onClick={() => router.push('/')} className="mt-4">
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Prepare image data for Lightbox
  const lightboxImage: MessageImage | null = post.coverImg
    ? {
        id: Number(post.id), // Use post ID as a pseudo image ID for this context
        url: post.coverImg,
        // r2Key is not available here
      }
    : null

  return (
    <Card className="container mx-auto max-w-3xl my-6 shadow-lg dark:border-gray-700">
      <CardHeader>
        <div className="flex items-center space-x-3 mb-3">
          <Avatar className="h-10 w-10">
            <AvatarImage
              src={post.author?.image ?? undefined}
              alt={post.author?.name ?? 'Author'}
            />
            <AvatarFallback>{getInitials(post.author?.name)}</AvatarFallback>
          </Avatar>
          <div>
            <CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {post.author?.name || 'Anonymous User'}
            </CardTitle>
            <CardDescription className="text-xs text-gray-500 dark:text-gray-400">
              Posted{' '}
              {post.createdAt
                ? formatDistanceToNowStrict(new Date(post.createdAt), {
                    addSuffix: true,
                  })
                : 'some time ago'}
            </CardDescription>
          </div>
          <div className="ml-auto">
            <Button
              variant="ghost"
              size="icon"
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          </div>
        </div>
        {post.parentPost && (
          <div className="mb-2 text-sm text-muted-foreground">
            <Repeat size={14} className="inline-block mr-1 -mt-0.5" />
            Inspired by:{' '}
            <Link
              href={`/posts/${post.parentPost.id}`}
              className="hover:underline text-primary"
            >
              &ldquo;{post.parentPost.title || 'a previous vibe'}&rdquo;
            </Link>
            {post.parentPost.author && (
              <>
                {' by '}
                <Link
                  href={`/u/${post.parentPost.author.username}`}
                  className="hover:underline text-primary"
                >
                  @
                  {post.parentPost.author.username ||
                    post.parentPost.author.name ||
                    'another user'}
                </Link>
              </>
            )}
          </div>
        )}
        {post.title && (
          <h2 className="text-xl font-semibold mb-2">{post.title}</h2>
        )}
        {post.tags && post.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {post.tags.map((tag: string) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-xs dark:bg-gray-700 dark:text-gray-300"
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className="pb-4 pt-0">
        {post.coverImg && (
          <button
            type="button"
            className="relative block aspect-video w-full mb-6 bg-muted rounded-lg overflow-hidden cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background p-0 border-0"
            onClick={() => setLightboxOpen(true)}
            aria-label={`View image: ${post.title || 'Untitled Vibe'}`}
          >
            <Image
              src={post.coverImg}
              alt={post.title || 'Post image'}
              fill
              className="object-contain"
              priority
            />
          </button>
        )}
        <div className="prose dark:prose-invert max-w-none mb-6">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {post.description || 'No description available.'}
          </ReactMarkdown>
        </div>

        <div className="mt-3 text-xs text-gray-500 dark:text-gray-400 flex items-center">
          <Eye className="h-4 w-4 mr-1.5" />
          {post.viewCount ?? 0} views
        </div>
      </CardContent>

      <Separator className="my-0 dark:bg-gray-700" />

      <CardFooter className="py-3 px-4 sm:px-6 flex items-center justify-start space-x-1 sm:space-x-2 bg-gray-50 dark:bg-gray-800/30">
        <Button
          variant="ghost"
          size="icon"
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          onClick={() => likeMutation.mutate()}
          disabled={likeMutation.isPending}
        >
          {likeMutation.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : post.isLiked ? (
            <Heart className="h-5 w-5 text-red-500 fill-red-500" />
          ) : (
            <Heart className="h-5 w-5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          onClick={() => commentInputRef.current?.focus()}
        >
          <MessageSquare className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          onClick={handleRemixClick}
        >
          <Repeat className="h-5 w-5" />
        </Button>
        <div className="flex-grow" />
        <Button
          variant="ghost"
          size="icon"
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          onClick={handleBookmarkClick}
        >
          <Bookmark className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          onClick={handleShareClick}
        >
          <Share2 className="h-5 w-5" />
        </Button>
      </CardFooter>

      <Separator className="my-0 dark:bg-gray-700" />

      {/* Comments Section */}
      <div className="px-4 py-6 sm:px-6">
        <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-gray-100">
          Comments ({post.commentCount ?? comments?.length ?? 0})
        </h2>

        {currentUser && post && post.id && (
          <CommentInput
            onSubmit={handleCommentSubmit}
            currentUser={currentUser}
            isLoading={createCommentMutation.isPending}
            replyTarget={replyTarget}
            onCancelReply={cancelReply}
            ref={commentInputRef}
          />
        )}
        {!currentUser && (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-3">
            Please log in to post a comment.
          </p>
        )}
        {currentUser && (!post || !post.id) && isLoadingPost && (
          <Skeleton className="h-28 w-full mt-4 rounded-lg" />
        )}

        {isLoadingComments && (
          <div className="space-y-4 mt-4">
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        )}
        {commentsError && (
          <p className="text-red-500 mt-4 py-3">
            Failed to load comments: {commentsError.message}
          </p>
        )}
        {!isLoadingComments &&
          !commentsError &&
          comments &&
          comments.length > 0 && (
            <div className="mt-4 space-y-0 divide-y divide-gray-200 dark:divide-gray-700 border-t border-gray-200 dark:border-gray-700">
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
          )}
        {!isLoadingComments &&
          !commentsError &&
          (!comments || comments.length === 0) && (
            <p className="text-gray-500 dark:text-gray-400 mt-4 py-3">
              No comments yet. Be the first to comment!
            </p>
          )}
      </div>

      {/* Lightbox Component */}
      {lightboxImage && (
        <ImageLightbox
          isOpen={lightboxOpen}
          onOpenChange={setLightboxOpen}
          imageUrl={lightboxImage.url}
          altText={post.title || 'Post image'}
        />
      )}
    </Card>
  )
}
