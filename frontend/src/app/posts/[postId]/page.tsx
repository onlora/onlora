'use client'

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
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import CommentInput from '@/components/comments/CommentInput'
import CommentItem from '@/components/comments/CommentItem'
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
  createComment,
  getComments,
} from '@/lib/api/commentApi'
import {
  type PostDetails,
  type ToggleLikeResponse,
  getPostCloneInfo,
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

  const [isRemixing, setIsRemixing] = useState(false)

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
    { body: string; parentId?: number },
    { previousComments?: CommentWithAuthor[]; optimisticCommentId?: number }
  >({
    mutationFn: async ({ body, parentId }) => {
      if (!post || !post.id)
        throw new Error('Post not loaded or post ID missing for createComment')
      return createComment({ postId: Number(post.id), body, parentId })
    },
    onMutate: async (newCommentData) => {
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
        parentId: newCommentData.parentId || null,
        body: newCommentData.body,
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

  const handleCreateComment = async (body: string, parentId?: number) => {
    if (!post || !currentUser) {
      toast.error('You must be logged in to comment or post not loaded.')
      return
    }
    if (!body.trim()) {
      toast.error('Comment cannot be empty.')
      return
    }
    await createCommentMutation.mutate({ body, parentId })
  }

  const handleRemixClick = async () => {
    if (!postIdString) return
    setIsRemixing(true)
    try {
      toast.info('Fetching post info for remix...')
      const cloneInfo = await getPostCloneInfo(postIdString)
      console.log('Clone Info:', cloneInfo) // Log for debugging

      // TODO: Navigate to Jam UI with cloneInfo
      // Example: Pass data via query params or state management
      // router.push(`/jam/new?prompt=${encodeURIComponent(cloneInfo.prompt || '')}&model=${cloneInfo.model || 'default'}&parentPostId=${cloneInfo.parentPostId}&rootPostId=${cloneInfo.rootPostId}&generation=${cloneInfo.generation}`);
      router.push('/jam/remix-placeholder') // Placeholder navigation
      toast.success('Starting remix session!')
    } catch (error: unknown) {
      console.error('Failed to get post info for remixing:', error)
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Failed to start remix: ${errorMessage}`)
    } finally {
      setIsRemixing(false)
    }
  }

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
        <h1 className="text-2xl font-bold leading-tight text-gray-900 dark:text-gray-50">
          {post.title}
        </h1>
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

      <CardContent>
        {post.coverImg && (
          <div className="mb-4 relative aspect-[16/9] w-full overflow-hidden rounded-lg border dark:border-gray-700">
            <Image
              src={post.coverImg}
              alt={`Cover image for ${post.title}`}
              layout="fill"
              objectFit="cover"
              priority // Consider if this is always the LCP
            />
          </div>
        )}
        <div className="prose prose-sm sm:prose dark:prose-invert max-w-none whitespace-pre-wrap">
          {post.description || 'No description available.'}
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
          size="sm"
          className={`flex items-center text-sm ${post.isLiked ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'} hover:text-red-600 dark:hover:text-red-400`}
          onClick={() => likeMutation.mutate()}
          disabled={likeMutation.isPending || !post}
        >
          <Heart
            className={`mr-1.5 h-4 w-4 ${post.isLiked ? 'fill-current' : ''}`}
          />
          {post.likeCount} {post.likeCount === 1 ? 'Like' : 'Likes'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          <MessageSquare className="mr-1.5 h-4 w-4" />
          {post.commentCount} {post.commentCount === 1 ? 'Comment' : 'Comments'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="hidden sm:flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          onClick={handleRemixClick}
          disabled={isRemixing || !post || post.visibility !== 'public'}
        >
          {isRemixing ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Repeat className="mr-1.5 h-4 w-4" />
          )}
          Remix
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="hidden sm:flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          <Share2 className="mr-1.5 h-4 w-4" />
          Share
        </Button>
        <div className="flex-grow" />
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          <Bookmark className="mr-1.5 h-4 w-4" />
          Save
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
            postId={Number(post.id)}
            onSubmit={handleCreateComment}
            currentUser={currentUser}
            isLoading={createCommentMutation.isPending}
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
              {comments.map((comment) => (
                <CommentItem key={comment.id} comment={comment} />
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
    </Card>
  )
}
