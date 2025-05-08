'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { getInitials } from '@/lib/utils'
import { Loader2, SendHorizonal, X } from 'lucide-react'
import type React from 'react'
import { forwardRef, useEffect, useState } from 'react'

interface CommentReplyTarget {
  id: number
  authorName: string
}

interface CommentInputProps {
  onSubmit: (body: string) => Promise<void> | void
  currentUser: { id: string; name: string | null; image: string | null }
  isLoading?: boolean
  replyTarget?: CommentReplyTarget | null
  onCancelReply?: () => void
}

const CommentInput = forwardRef<HTMLTextAreaElement, CommentInputProps>(
  ({ onSubmit, currentUser, isLoading, replyTarget, onCancelReply }, ref) => {
    const [commentBody, setCommentBody] = useState('')

    useEffect(() => {
      if (!replyTarget) {
        setCommentBody('')
      }
    }, [replyTarget])

    const handleSubmit = (e?: React.FormEvent<HTMLFormElement>) => {
      e?.preventDefault()
      if (!commentBody.trim() || isLoading) return

      Promise.resolve(onSubmit(commentBody))
        .then(() => {})
        .catch((error) => {
          console.error('Error submitting comment from input:', error)
        })
    }

    return (
      <div className="mt-4">
        {replyTarget && (
          <div className="text-sm text-muted-foreground mb-2 bg-secondary dark:bg-secondary/50 p-2 rounded-md flex justify-between items-center">
            <span>
              Replying to <strong>{replyTarget.authorName}</strong>
            </span>
            {onCancelReply && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onCancelReply}
                aria-label="Cancel reply"
                className="h-6 px-1.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex items-start space-x-3">
          <Avatar className="h-8 w-8 mt-1 flex-shrink-0">
            <AvatarImage src={currentUser.image ?? undefined} />
            <AvatarFallback>{getInitials(currentUser.name)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 relative">
            <Textarea
              ref={ref}
              id="comment-input"
              rows={replyTarget ? 3 : 2}
              placeholder={
                replyTarget
                  ? `Replying to ${replyTarget.authorName}...`
                  : 'Add a comment...'
              }
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              className="pr-12 resize-none block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary focus:border-primary sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
              disabled={isLoading}
            />
            <Button
              type="submit"
              size="icon"
              className="absolute right-2 bottom-2 h-7 w-7 rounded-full"
              disabled={!commentBody.trim() || isLoading}
              aria-label="Submit comment"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SendHorizonal className="h-4 w-4" />
              )}
            </Button>
          </div>
        </form>
      </div>
    )
  },
)

CommentInput.displayName = 'CommentInput'

export default CommentInput
