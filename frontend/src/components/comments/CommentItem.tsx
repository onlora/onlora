'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import type { CommentWithAuthor } from '@/lib/api/commentApi'
import { getInitials } from '@/lib/utils'
import { formatDistanceToNowStrict } from 'date-fns'
import { CornerDownRight } from 'lucide-react' // Icon for reply button
import Link from 'next/link'

interface CommentItemProps {
  comment: CommentWithAuthor
  allCommentsById: Record<number, CommentWithAuthor> // Map of all comments
  nestingLevel: number // Current depth
  currentUserId?: string | null // ID of the logged-in user
  onReply: (commentId: number, authorName: string) => void // Reply handler
}

export default function CommentItem({
  comment,
  allCommentsById,
  nestingLevel,
  currentUserId,
  onReply,
}: CommentItemProps) {
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

  const canReply = !!currentUserId // User must be logged in to reply

  return (
    <div
      className={`py-4 ${nestingLevel > 0 ? `ml-${nestingLevel * 4} pl-4 border-l border-dashed border-gray-200 dark:border-gray-700` : ''}`}
    >
      <div className="flex space-x-3">
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarImage src={author?.image ?? undefined} />
          <AvatarFallback>
            {getInitials(author?.name || author?.username)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">
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
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {timeAgo}
            </p>
          </div>
          <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
            {comment.body}
          </p>
          {canReply && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReplyClick}
              className="text-xs h-6 px-1.5"
            >
              <CornerDownRight className="h-3 w-3 mr-1" /> Reply
            </Button>
          )}
        </div>
      </div>
      {/* Recursively render children */}
      {childComments.length > 0 && (
        <div className="mt-4 space-y-0">
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
