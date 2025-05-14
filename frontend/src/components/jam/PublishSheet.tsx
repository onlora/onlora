'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { MessageImage } from '@/types/images'
import { Tag, X } from 'lucide-react'
import { useEffect, useState } from 'react'

export type PostVisibility = 'public' | 'private'

export interface PublishData {
  title: string
  description: string
  tags: string[]
}

interface PublishSheetProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  selectedImages: MessageImage[]
  onSubmit: (publishData: PublishData) => void
  isSubmitting?: boolean
  initialTitle?: string
  initialTags?: string[]
}

export function PublishSheet({
  isOpen,
  onOpenChange,
  selectedImages,
  onSubmit,
  isSubmitting,
  initialTitle = '',
  initialTags = [],
}: PublishSheetProps) {
  // Remove debug logs
  const [title, setTitle] = useState(initialTitle)
  const [description, setDescription] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>(initialTags)

  useEffect(() => {
    if (isOpen) {
      // Reset form when dialog opens
      setTitle(initialTitle || '')
      setDescription('')
      setTagInput('')
      setTags(initialTags || [])
    }
  }, [isOpen, initialTitle, initialTags])

  const handleTagAdd = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (
      (e.key === 'Enter' || e.key === ' ' || e.key === ',') &&
      tagInput.trim()
    ) {
      e.preventDefault()
      const newTag = tagInput.trim().replace(/^#/, '').replace(/,/g, '')
      if (newTag && !tags.includes(newTag)) {
        setTags([...tags, newTag])
      }
      setTagInput('')
    }
  }

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove))
  }

  const handleSubmit = () => {
    if (selectedImages.length === 0) {
      alert('At least one image is required.')
      return
    }

    // Extract hashtags from description if they exist
    const extractedTags = description.match(/#(\w+)/g) || []
    const tagsFromDescription = extractedTags.map((tag) => tag.substring(1))

    // Combine and deduplicate tags
    const allTags = [...new Set([...tagsFromDescription, ...tags])]

    // Use provided title or generate a default one
    const finalTitle =
      title ||
      (description && description.length > 30
        ? `${description.substring(0, 30)}...`
        : description || 'My Vibe')

    const publishData = {
      title: finalTitle,
      description,
      tags: allTags,
    }

    onSubmit(publishData)
  }

  const characterLimit = 280
  const characterCount = description.length
  const remainingCharacters = characterLimit - characterCount
  const isOverLimit = remainingCharacters < 0

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] p-0 overflow-hidden rounded-xl">
        <div className="flex flex-col p-4">
          {/* Title Input */}
          <Input
            placeholder="Add a title to your vibe"
            className="w-full border-none text-lg placeholder:text-gray-400 focus-visible:ring-0 p-0 h-auto mb-3 font-medium"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          {/* Text Input Area */}
          <Textarea
            placeholder="What's your vibe?"
            className="w-full border-none resize-none text-lg placeholder:text-gray-400 focus-visible:ring-0 p-0 h-auto min-h-[120px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={characterLimit}
          />

          {/* Image Preview Section */}
          {selectedImages.length > 0 && (
            <div className="mt-3 relative">
              <div className="grid grid-cols-3 gap-2 rounded-xl overflow-hidden">
                {selectedImages.map((image) => (
                  <div
                    key={image.id}
                    className="relative aspect-square rounded-xl overflow-hidden"
                  >
                    <img
                      src={image.url}
                      alt="Selected vibe"
                      className="object-cover w-full h-full"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tags Section */}
          <div className="mt-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-gray-500" />
              <div className="flex-1 flex items-center flex-wrap gap-2">
                {tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="flex items-center gap-1 px-2 py-0.5"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="h-3 w-3 rounded-full inline-flex items-center justify-center hover:bg-gray-300 ml-1"
                    >
                      <X className="h-2 w-2" />
                    </button>
                  </Badge>
                ))}
                <input
                  type="text"
                  className="flex-1 min-w-[100px] bg-transparent border-none focus:outline-none p-0 h-6 text-sm placeholder:text-gray-400"
                  placeholder="Add tags (press Space or Enter)"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagAdd}
                />
              </div>
            </div>
          </div>

          {/* Bottom Action Bar */}
          <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center">
            <div className="flex-1" />
            <div className="flex items-center gap-4">
              {(isOverLimit || remainingCharacters <= 20) && (
                <div
                  className={`text-xs ${isOverLimit ? 'text-red-500' : 'text-gray-500'}`}
                >
                  {remainingCharacters}
                </div>
              )}
              <Button
                className="rounded-full px-6 py-1.5 font-medium"
                onClick={handleSubmit}
                disabled={
                  isSubmitting || selectedImages.length === 0 || isOverLimit
                }
              >
                {isSubmitting ? 'Publishing...' : 'Publish'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
