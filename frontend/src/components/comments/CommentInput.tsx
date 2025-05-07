import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type React from 'react'
import { useState } from 'react'

interface CommentInputProps {
  postId: number
  parentId?: number // For replying to a specific comment
  onSubmit: (commentBody: string, parentId?: number) => Promise<void>
  onCancel?: () => void // For reply form
  currentUser?: {
    name?: string | null
    image?: string | null
  } | null
  placeholder?: string
  submitButtonText?: string
  isLoading?: boolean
}

const CommentInput: React.FC<CommentInputProps> = ({
  postId,
  parentId,
  onSubmit,
  onCancel,
  currentUser,
  placeholder = 'Write a comment...',
  submitButtonText = 'Comment',
  isLoading = false,
}) => {
  const [commentBody, setCommentBody] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!commentBody.trim() || isLoading) return
    await onSubmit(commentBody.trim(), parentId)
    setCommentBody('') // Clear input after successful submission
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-start space-x-3 py-4">
      {currentUser && (
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarImage
            src={currentUser.image ?? undefined}
            alt={currentUser.name ?? 'User'}
          />
          <AvatarFallback>
            {currentUser.name?.[0]?.toUpperCase() ?? 'U'}
          </AvatarFallback>
        </Avatar>
      )}
      <div className="flex-1">
        <Textarea
          value={commentBody}
          onChange={(e) => setCommentBody(e.target.value)}
          placeholder={placeholder}
          className="w-full resize-none"
          rows={2} // Start with 2 rows, can expand if needed
          disabled={isLoading}
        />
        <div className="mt-2 flex items-center justify-end space-x-2">
          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={isLoading}
            >
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            disabled={!commentBody.trim() || isLoading}
            className="min-w-[80px]"
          >
            {isLoading ? 'Submitting...' : submitButtonText}
          </Button>
        </div>
      </div>
    </form>
  )
}

export default CommentInput
