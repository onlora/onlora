'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import type { CommentWithAuthor } from '@/lib/api/commentApi'
import { getInitials } from '@/lib/utils'
import { formatDistanceToNowStrict } from 'date-fns'
import { CornerDownRight, Heart, MoreHorizontal } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

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
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)

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
    setLiked(!liked)
    setLikeCount(liked ? likeCount - 1 : likeCount + 1)
  }

  const canReply = !!currentUserId // User must be logged in to reply
  const maxNestingLevel = 4 // Limit nesting depth for better UI

  // For deeply nested comments, reduce the left margin to avoid excessive indentation
  const effectiveNestingLevel = Math.min(nestingLevel, maxNestingLevel)

  return (
    <div
      className={`py-3 ${
        nestingLevel > 0
          ? `ml-${effectiveNestingLevel * 4} pl-4 border-l border-gray-100`
          : ''
      }`}
    >
      <div className="flex space-x-3">
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarImage src={author?.image ?? undefined} />
          <AvatarFallback>
            {getInitials(author?.name || author?.username)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-1.5">
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
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>

          <div className="bg-gray-50 rounded-2xl px-4 py-3">
            <p className="text-sm text-gray-800 whitespace-pre-wrap">
              {comment.body}
            </p>
          </div>

          <div className="flex items-center gap-4 pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLikeClick}
              className={`text-xs h-6 px-2 flex items-center gap-1 rounded-full ${
                liked ? 'text-red-500' : ''
              }`}
            >
              <Heart className={`h-3.5 w-3.5 ${liked ? 'fill-red-500' : ''}`} />
              {likeCount > 0 && <span>{likeCount}</span>}
            </Button>

            {canReply && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReplyClick}
                className="text-xs h-6 px-2 rounded-full"
              >
                <CornerDownRight className="h-3.5 w-3.5 mr-1" /> Reply
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Recursively render children */}
      {childComments.length > 0 && (
        <div className="mt-3 space-y-0">
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
