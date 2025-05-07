import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { CommentWithAuthor } from '@/lib/api/commentApi' // Assuming this path is correct
import { formatDistanceToNowStrict } from 'date-fns'
import type React from 'react'

interface CommentItemProps {
  comment: CommentWithAuthor
}

const CommentItem: React.FC<CommentItemProps> = ({ comment }) => {
  const { author, body, createdAt } = comment

  const timeAgo = createdAt
    ? formatDistanceToNowStrict(new Date(createdAt), { addSuffix: true })
    : 'just now'

  return (
    <div className="flex items-start space-x-3 py-4">
      <Avatar className="h-8 w-8">
        <AvatarImage
          src={author?.image ?? undefined}
          alt={author?.name ?? 'User'}
        />
        <AvatarFallback>
          {author?.name?.[0]?.toUpperCase() ?? 'U'}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1">
        <div className="flex items-center space-x-2">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {author?.name ?? 'Anonymous'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{timeAgo}</p>
        </div>
        <p className="mt-1 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
          {body}
        </p>
        {/* Placeholder for reply button or other actions */}
        {/* <div className="mt-2">
          <button className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
            Reply
          </button>
        </div> */}
      </div>
    </div>
  )
}

export default CommentItem
