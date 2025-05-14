'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { getInitials } from '@/lib/utils'
import data from '@emoji-mart/data'
import Picker from '@emoji-mart/react'
import {
  Bookmark,
  Heart,
  Loader2,
  MessageSquare,
  Share2,
  SmilePlus,
  X,
} from 'lucide-react'
import { forwardRef, useEffect, useRef, useState } from 'react'

interface CommentReplyTarget {
  id: string
  authorName: string
}

interface CommentInputProps {
  onSubmit: (body: string) => Promise<void> | void
  currentUser: { id: string; name: string | null; image: string | null }
  isLoading?: boolean
  replyTarget?: CommentReplyTarget | null
  onCancelReply?: () => void
  likeCount?: number
  commentCount?: number
  onLike?: () => void
  onShare?: () => void
  onBookmark?: () => void
  isLiked?: boolean
  isBookmarked?: boolean
}

const CommentInput = forwardRef<HTMLTextAreaElement, CommentInputProps>(
  (
    {
      onSubmit,
      currentUser,
      isLoading,
      replyTarget,
      onCancelReply,
      likeCount = 0,
      commentCount = 0,
      onLike,
      onShare,
      onBookmark,
      isLiked = false,
      isBookmarked = false,
    },
    ref,
  ) => {
    const [commentBody, setCommentBody] = useState('')
    const [showEmojiPicker, setShowEmojiPicker] = useState(false)
    const [isActive, setIsActive] = useState(false)
    const [textareaHeight, setTextareaHeight] = useState('auto')
    const textareaRef = useRef<HTMLTextAreaElement | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    // Combine forwarded ref with local ref
    useEffect(() => {
      if (ref) {
        if (typeof ref === 'function') {
          ref(textareaRef.current)
        } else {
          ref.current = textareaRef.current
        }
      }
    }, [ref])

    // Reset input when reply target changes
    useEffect(() => {
      if (!replyTarget) {
        setCommentBody('')
      } else {
        setIsActive(true)
      }
    }, [replyTarget])

    // Function to resize textarea
    const resizeTextarea = () => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
        setTextareaHeight(`${textareaRef.current.scrollHeight}px`)
      }
    }

    // Auto-resize textarea when content changes
    useEffect(() => {
      resizeTextarea()
      // The resizeTextarea function only depends on textareaRef which is stable
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [commentBody])

    // Handle clicks outside the comment container
    useEffect(() => {
      if (!isActive) return

      const handleClickOutside = (event: MouseEvent) => {
        if (
          containerRef.current &&
          !containerRef.current.contains(event.target as Node) &&
          !commentBody.trim() &&
          !replyTarget
        ) {
          setIsActive(false)
          setShowEmojiPicker(false)
        }
      }

      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }, [isActive, commentBody, replyTarget])

    const handleSubmit = (e?: React.FormEvent<HTMLFormElement>) => {
      e?.preventDefault()
      if (!commentBody.trim() || isLoading) return

      Promise.resolve(onSubmit(commentBody))
        .then(() => {
          setCommentBody('')
          setTextareaHeight('auto')
          setIsActive(false)
          setShowEmojiPicker(false)
        })
        .catch((error) => {
          console.error('Error submitting comment from input:', error)
        })
    }

    const addEmoji = (emoji: { native: string }) => {
      setCommentBody((prev) => prev + emoji.native)
      setShowEmojiPicker(false)
      textareaRef.current?.focus()
    }

    // Activate the input on focus
    const activateInput = () => {
      setIsActive(true)
      setTimeout(() => {
        textareaRef.current?.focus()
      }, 0)
    }

    // Handle cancel
    const handleCancel = () => {
      setCommentBody('')
      setIsActive(false)
      setShowEmojiPicker(false)
      if (replyTarget && onCancelReply) {
        onCancelReply()
      }
    }

    return (
      <div ref={containerRef} className="relative">
        {replyTarget && (
          <div className="text-sm text-muted-foreground mb-2 bg-secondary/30 px-3 py-2 rounded-md flex justify-between items-center">
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

        {/* Compact state (inactive) */}
        {!isActive ? (
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="bg-gray-50 rounded-full p-3 flex items-center gap-3 cursor-text text-left flex-1 mr-3"
              onClick={activateInput}
              aria-label="Activate comment input"
            >
              <Avatar className="h-8 w-8 flex-shrink-0">
                <AvatarImage src={currentUser.image ?? undefined} />
                <AvatarFallback>{getInitials(currentUser.name)}</AvatarFallback>
              </Avatar>
              <span className="text-gray-400 text-sm">Say something...</span>
            </button>
            <div className="flex items-center gap-4">
              <button
                type="button"
                className="flex items-center gap-1.5"
                onClick={onLike}
              >
                {isLiked ? (
                  <Heart className="h-[22px] w-[22px] fill-red-500 text-red-500" />
                ) : (
                  <Heart className="h-[22px] w-[22px]" />
                )}
                <span className="text-[15px]">{likeCount}</span>
              </button>
              <button type="button" className="flex items-center gap-1.5">
                <MessageSquare className="h-[22px] w-[22px]" />
                <span className="text-[15px]">{commentCount}</span>
              </button>
              <button type="button" onClick={onBookmark}>
                {isBookmarked ? (
                  <Bookmark className="h-[22px] w-[22px] fill-gray-700" />
                ) : (
                  <Bookmark className="h-[22px] w-[22px]" />
                )}
              </button>
              <button type="button" onClick={onShare}>
                <Share2 className="h-[22px] w-[22px]" />
              </button>
            </div>
          </div>
        ) : (
          /* Expanded state (active) */
          <div className="bg-gray-50 rounded-2xl p-3 shadow-sm">
            <div className="flex items-start gap-3">
              <Avatar className="h-8 w-8 mt-1 flex-shrink-0">
                <AvatarImage src={currentUser.image ?? undefined} />
                <AvatarFallback>{getInitials(currentUser.name)}</AvatarFallback>
              </Avatar>

              <div className="flex-1">
                <form onSubmit={handleSubmit} className="relative">
                  <textarea
                    ref={textareaRef}
                    placeholder={
                      replyTarget
                        ? `Reply to ${replyTarget.authorName}...`
                        : 'Say something...'
                    }
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    style={{ height: textareaHeight }}
                    className="w-full border-0 bg-transparent text-sm py-1 resize-none focus:ring-0 focus:outline-none placeholder:text-gray-400"
                    disabled={isLoading}
                  />
                </form>
              </div>
            </div>

            {/* Emoji display area */}
            <div className="flex justify-end mt-1 mb-2">
              {showEmojiPicker ? (
                <div className="absolute z-10 bottom-16 right-0">
                  <Picker
                    data={data}
                    onEmojiSelect={addEmoji}
                    theme="light"
                    previewPosition="none"
                    skinTonePosition="none"
                  />
                </div>
              ) : null}
            </div>

            <div className="mt-2 flex justify-between items-center border-t border-gray-100 pt-2">
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                >
                  <SmilePlus className="h-5 w-5" />
                </Button>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={handleCancel}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="rounded-full"
                  disabled={!commentBody.trim() || isLoading}
                  onClick={() => handleSubmit()}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : null}
                  Send
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  },
)

CommentInput.displayName = 'CommentInput'

export default CommentInput
