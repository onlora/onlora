'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import type { MessageImage } from '@/lib/api/jamApi' // Assuming this type exists for image data
import { useEffect, useState } from 'react'

export type PostVisibility = 'public' | 'private'

interface PublishData {
  title: string
  description: string
  tags: string[]
  visibility: PostVisibility
  // communityId?: string; // Optional for now
}

interface PublishSheetProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  selectedImages: MessageImage[] // To display previews
  onSubmit: (publishData: PublishData) => void // Changed from onPublish to onSubmit
  isSubmitting?: boolean
  initialTitle?: string // Added for remix pre-fill
  initialTags?: string[] // Added for remix pre-fill
}

export function PublishSheet({
  isOpen,
  onOpenChange,
  selectedImages,
  onSubmit, // Changed from onPublish
  isSubmitting,
  initialTitle = '', // Default to empty string
  initialTags = [], // Default to empty array
}: PublishSheetProps) {
  const [title, setTitle] = useState(initialTitle)
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState(initialTags.join(', '))
  const [visibility, setVisibility] = useState<PostVisibility>('private')

  useEffect(() => {
    if (isOpen) {
      // Reset fields when sheet opens, based on initial props
      setTitle(initialTitle || '')
      setDescription('') // Assuming description is not pre-filled from remix
      setTags((initialTags || []).join(', '))
      setVisibility('private') // Default visibility
    }
  }, [isOpen, initialTitle, initialTags])

  const handleSubmit = () => {
    // Renamed from handlePublish
    if (!title.trim() || selectedImages.length === 0) {
      // TODO: Show error toast/message more formally
      alert('Title and at least one image are required.')
      return
    }
    onSubmit({
      title,
      description,
      tags: tags
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag),
      visibility,
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Publish Your Vibe</DialogTitle>
          <DialogDescription>
            Share your selected images. Add a title, description, tags, and set
            visibility.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {/* Selected Images Preview Placeholder */}
          {selectedImages.length > 0 && (
            <div className="mb-4">
              <Label className="text-sm font-medium">
                Selected Images ({selectedImages.length})
              </Label>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 max-h-40 overflow-y-auto p-2 border rounded-md bg-muted/50">
                {selectedImages.map((image) => (
                  <div
                    key={image.id}
                    className="relative aspect-square rounded-md overflow-hidden"
                  >
                    <img
                      src={image.url}
                      alt={`Selected creation ${image.id}`}
                      className="object-cover w-full h-full"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="title" className="text-right">
              Title*
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="col-span-3"
              placeholder="My Awesome Vibe"
              required
            />
          </div>
          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="description" className="text-right pt-2">
              Description
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="col-span-3"
              placeholder="Tell us more about your art... (optional)"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="tags" className="text-right">
              Tags
            </Label>
            <Input
              id="tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="col-span-3"
              placeholder="e.g., fantasy, abstract, vibrant (comma-separated)"
            />
            {/* Future: Replace with a dedicated TagInput component */}
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Visibility*</Label>
            <RadioGroup
              value={visibility}
              onValueChange={(value: string) =>
                setVisibility(value as PostVisibility)
              }
              className="col-span-3 flex items-center space-x-4"
              required
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="private" id="visibility-private" />
                <Label htmlFor="visibility-private" className="font-normal">
                  Private
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="public" id="visibility-public" />
                <Label htmlFor="visibility-public" className="font-normal">
                  Public
                </Label>
              </div>
            </RadioGroup>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="community" className="text-right">
              Community
            </Label>
            {/* Placeholder for Community Select */}
            <Input
              id="community"
              disabled
              className="col-span-3"
              placeholder="Community selection (coming soon)"
            />
            {/* 
            <Select disabled>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select a community (coming soon)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General</SelectItem>
              </SelectContent>
            </Select> 
            */}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit} // Changed from handlePublish
            disabled={
              isSubmitting || selectedImages.length === 0 || !title.trim()
            }
          >
            {isSubmitting ? 'Publishing...' : 'Publish Vibe'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
