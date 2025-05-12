'use client'

import { Button } from '@/components/ui/button'
import type { MessageImage } from '@/lib/api/jamApi'
import { cn } from '@/lib/utils'
import { Check, Grid2X2, Maximize, Pocket, X } from 'lucide-react'
import { useState } from 'react'

interface ImagePanelProps {
  images: MessageImage[]
  selectedImage: MessageImage | null
  selectedImageIds: Set<number>
  onImageSelect: (imageId: number) => void
  onSave: () => void
  onPublish: () => void
  onClose?: () => void
}

export const ImagePanel = ({
  images,
  selectedImage,
  selectedImageIds,
  onImageSelect,
  onSave,
  onPublish,
  onClose,
}: ImagePanelProps) => {
  const [viewMode, setViewMode] = useState<'single' | 'grid'>('grid')

  // Ensure the selected image is first in the display
  const imagesToDisplay = selectedImage
    ? [selectedImage, ...images.filter((img) => img.id !== selectedImage.id)]
    : images

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-background to-background/95 shadow-[0_0_15px_rgba(0,0,0,0.05)_inset]">
      {/* Header */}
      <div className="px-6 py-5 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-medium text-foreground/90">Gallery</h3>
          <div className="text-sm text-muted-foreground ml-2 bg-accent/50 px-2 py-0.5 rounded-full">
            {selectedImageIds.size > 0
              ? `${selectedImageIds.size} selected`
              : `${images.length} images`}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-accent/50 rounded-full p-0.5 flex">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode('single')}
              className={cn(
                'h-8 rounded-full',
                viewMode === 'single' &&
                  'bg-background text-foreground shadow-sm',
              )}
            >
              <Maximize className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode('grid')}
              className={cn(
                'h-8 rounded-full',
                viewMode === 'grid' &&
                  'bg-background text-foreground shadow-sm',
              )}
            >
              <Grid2X2 className="h-4 w-4" />
            </Button>
          </div>

          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-6">
        {/* Single image view */}
        {viewMode === 'single' && selectedImage && (
          <div className="relative aspect-square bg-accent/20 rounded-xl overflow-hidden shadow-sm mt-4 pt-6">
            <img
              src={selectedImage.url}
              alt={`Generated content ${selectedImage.id}`}
              className="w-full h-full object-contain"
            />
          </div>
        )}

        {/* Grid view */}
        {viewMode === 'grid' && (
          <div className="grid grid-cols-2 gap-4 mt-4">
            {imagesToDisplay.map((image) => {
              const isSelected = selectedImageIds.has(image.id)
              return (
                <button
                  key={image.id}
                  type="button"
                  className={cn(
                    'relative aspect-square rounded-xl overflow-hidden transition-all cursor-pointer group',
                    isSelected
                      ? 'ring-2 ring-primary ring-offset-2 ring-offset-background shadow-md'
                      : 'hover:shadow-md hover:scale-[1.01] duration-200 ease-out',
                  )}
                  onClick={() => onImageSelect(image.id)}
                >
                  <img
                    src={image.url}
                    alt={`Generated content ${image.id}`}
                    className="w-full h-full object-cover"
                  />

                  {/* Selection indicator */}
                  <div
                    className={cn(
                      'absolute top-2 right-2 h-6 w-6 rounded-full flex items-center justify-center transition-all backdrop-blur-sm',
                      isSelected
                        ? 'bg-primary/90 shadow-sm'
                        : 'bg-black/30 opacity-0 group-hover:opacity-100',
                    )}
                  >
                    {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                  </div>

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Action footer */}
      <div className="px-6 py-5 mt-auto bg-accent/10 backdrop-blur-[2px]">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-full flex-shrink-0"
            disabled={selectedImageIds.size === 0}
            onClick={onSave}
            title="Save to Gallery"
          >
            <Pocket className="h-4 w-4" />
          </Button>
          <Button
            variant="default"
            className="flex-1 rounded-full py-6"
            disabled={selectedImageIds.size === 0}
            onClick={onPublish}
          >
            Post
          </Button>
        </div>
      </div>
    </div>
  )
}
