'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import type { CommentWithAuthor } from '@/lib/api/commentApi'
import { toggleCommentLike } from '@/lib/api/commentApi'
import { getInitials } from '@/lib/utils'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNowStrict } from 'date-fns'
import { Heart, MessageSquare } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

interface CommentItemProps {
  comment: CommentWithAuthor
  allCommentsById: Record<string, CommentWithAuthor> // Map of all comments
  nestingLevel: number // Current depth
  currentUserId?: string | null // ID of the logged-in user
  onReply: (commentId: string, authorName: string) => void // Reply handler
}

export default function CommentItem({
  comment,
  allCommentsById,
  nestingLevel,
  currentUserId,
  onReply,
}: CommentItemProps) {
  const queryClient = useQueryClient()
  const [isLiked, setIsLiked] = useState(comment.isLiked ?? false)
  const [localLikeCount, setLocalLikeCount] = useState(comment.likeCount ?? 0)

  // Update isLiked when comment prop changes (e.g., after a refetch)
  useEffect(() => {
    if (comment.isLiked !== undefined) {
      setIsLiked(comment.isLiked)
    }
    setLocalLikeCount(comment.likeCount ?? 0)
  }, [comment]) // Depend on the entire comment object to catch all changes

  const likeMutation = useMutation({
    mutationFn: () => toggleCommentLike(comment.id),
    onMutate: async () => {
      // Optimistic update
      const newIsLiked = !isLiked
      const newLikeCount = newIsLiked
        ? localLikeCount + 1
        : Math.max(0, localLikeCount - 1)

      setIsLiked(newIsLiked)
      setLocalLikeCount(newLikeCount)

      return { previousIsLiked: isLiked, previousLikeCount: localLikeCount }
    },
    onError: (error, _, context) => {
      // Revert on error
      if (context) {
        setIsLiked(context.previousIsLiked)
        setLocalLikeCount(context.previousLikeCount)
      }
      console.error('Error toggling like:', error)
      toast.error('Failed to update like')
    },
    onSuccess: (data) => {
      // Update with actual server value
      setIsLiked(data.liked)
      setLocalLikeCount(data.likeCount || 0)
    },
  })

  const author = comment.author
  const timeAgo = comment.createdAt
    ? formatDistanceToNowStrict(new Date(comment.createdAt), {
        addSuffix: true,
      })
    : ''

  // Find direct children of this comment
  const childComments = Object.values(allCommentsById)
    .filter((c) => c.parentId === comment.id)
    .sort(
      (a, b) =>
        new Date(a.createdAt || 0).getTime() -
        new Date(b.createdAt || 0).getTime(),
    ) // Sort children by date

  const handleReplyClick = () => {
    onReply(comment.id, author?.name || author?.username || 'User')
  }

  const handleLikeClick = () => {
    if (!currentUserId) {
      toast.error('Please sign in to like comments')
      return
    }
    likeMutation.mutate()
  }

  const canReply = !!currentUserId // User must be logged in to reply
  const maxNestingLevel = 4 // Limit nesting depth for better UI

  // For deeply nested comments, reduce the left margin to avoid excessive indentation
  const effectiveNestingLevel = Math.min(nestingLevel, maxNestingLevel)

  // Get reply count from commentCount or child comments length
  const replyCount = comment.commentCount || childComments.length

  // Enhanced heart rendering - simplified to avoid linter issues
  const renderHeart = () => {
    if (isLiked) {
      return (
        <Heart
          className="h-3.5 w-3.5 text-red-500"
          fill="rgb(239, 68, 68)"
          color="rgb(239, 68, 68)"
        />
      )
    }
    return <Heart className="h-3.5 w-3.5" />
  }

  return (
    <div
      className={`py-2 ${
        nestingLevel > 0
          ? `ml-${effectiveNestingLevel * 3} pl-3 border-l border-gray-100`
          : ''
      }`}
    >
      <div className="flex space-x-2">
        <Avatar className="h-7 w-7 flex-shrink-0">
          <AvatarImage src={author?.image ?? undefined} />
          <AvatarFallback>
            {getInitials(author?.name || author?.username)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium">
                {author ? (
                  <Link
                    href={`/u/${author.username}`}
                    className="hover:underline"
                  >
                    {author.name || author.username}
                  </Link>
                ) : (
                  'Anonymous'
                )}
              </h4>
              <p className="text-xs text-gray-500">{timeAgo}</p>
            </div>
          </div>

          <div className="bg-gray-50 rounded-2xl px-3 py-2">
            <p className="text-sm text-gray-800 whitespace-pre-wrap">
              {comment.body}
            </p>
          </div>

          <div className="flex items-center gap-3 pt-0.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLikeClick}
              className={`text-xs h-6 px-2 flex items-center gap-1 rounded-full ${
                isLiked ? 'text-red-500' : ''
              }`}
            >
              {renderHeart()}
              {localLikeCount > 0 && <span>{localLikeCount}</span>}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={canReply ? handleReplyClick : undefined}
              className={`text-xs h-6 px-2 flex items-center gap-1 rounded-full ${
                !canReply ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {replyCount > 0 && <span>{replyCount}</span>}
            </Button>
          </div>
        </div>
      </div>

      {/* Recursively render children */}
      {childComments.length > 0 && (
        <div className="mt-1.5 space-y-0">
          {childComments.map((child) => (
            <CommentItem
              key={child.id}
              comment={child}
              allCommentsById={allCommentsById}
              nestingLevel={nestingLevel + 1}
              currentUserId={currentUserId}
              onReply={onReply}
            />
          ))}
        </div>
      )}
    </div>
  )
}
