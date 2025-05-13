'use client'

import { Button } from '@/components/ui/button'
import type { MessageImage } from '@/lib/api/jamApi'
import { cn } from '@/lib/utils'
import {
  ArrowLeft,
  Check,
  CheckCircle,
  Download,
  Grid,
  LayoutGrid,
  Maximize,
  Pocket,
  X,
} from 'lucide-react'
import { useState } from 'react'

interface ImagePanelProps {
  images: MessageImage[]
  selectedImage: MessageImage | null
  selectedImageIds: Set<string>
  onImageSelect: (imageId: string) => void
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
  // Toggle between grid and single image view
  const [viewMode, setViewMode] = useState<'grid' | 'single'>('grid')
  // Toggle between compact (3 columns) and comfortable (2 columns) view
  const [isCompactView, setIsCompactView] = useState(false)
  // Currently focused image for single view
  const [focusedImage, setFocusedImage] = useState<MessageImage | null>(
    selectedImage,
  )

  // Handler for viewing a single image
  const handleViewImage = (image: MessageImage) => {
    setFocusedImage(image)
    setViewMode('single')
  }

  // Go back to grid view
  const handleBackToGrid = () => {
    setViewMode('grid')
  }

  // Handle download original image
  const handleDownloadImage = (image: MessageImage) => {
    // Create a link element and trigger download
    const link = document.createElement('a')
    link.href = image.url
    link.download = `image-${image.id}.jpg`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-background to-background/95">
      {/* Header - changes based on view mode */}
      <div className="px-4 py-3 flex justify-between items-center border-b border-accent/10">
        {viewMode === 'grid' ? (
          // Grid view header
          <>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-medium">Gallery</h3>
              <div className="text-xs text-muted-foreground bg-accent/20 px-2 py-0.5 rounded-full">
                {selectedImageIds.size} selected
              </div>
            </div>

            {onClose && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-7 w-7 rounded-full"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </>
        ) : (
          // Single view header - simplified with all controls in one place
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBackToGrid}
              className="h-8 w-8 p-0 rounded-full"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-full text-xs"
                onClick={() =>
                  focusedImage && handleDownloadImage(focusedImage)
                }
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                Download
              </Button>

              <Button
                variant={
                  selectedImageIds.has(focusedImage?.id || '')
                    ? 'default'
                    : 'outline'
                }
                size="sm"
                className="h-8 rounded-full text-xs min-w-[80px]"
                onClick={() => focusedImage && onImageSelect(focusedImage.id)}
              >
                {selectedImageIds.has(focusedImage?.id || '') ? (
                  <>
                    <CheckCircle className="h-3.5 w-3.5 mr-1" />
                    Selected
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Select
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Content area - changes based on view mode */}
      <div className="flex-1 overflow-y-auto">
        {viewMode === 'grid' ? (
          // Grid view
          <div className="p-3">
            <div
              className={cn(
                'grid gap-2',
                isCompactView ? 'grid-cols-3' : 'grid-cols-2',
              )}
            >
              {images.map((image) => {
                const isSelected = selectedImageIds.has(image.id)
                return (
                  <button
                    key={image.id}
                    type="button"
                    className={cn(
                      'relative aspect-square rounded-lg overflow-hidden transition-all cursor-pointer group',
                      isSelected
                        ? 'ring-2 ring-primary ring-offset-1 ring-offset-background shadow-sm'
                        : 'hover:brightness-90',
                    )}
                    onClick={() => onImageSelect(image.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        onImageSelect(image.id)
                      }
                    }}
                    aria-label={`Select image ${image.id}`}
                  >
                    {/* Image */}
                    <img
                      src={image.url}
                      alt={`Generated content ${image.id}`}
                      className="w-full h-full object-cover"
                    />

                    {/* Maximize button */}
                    <button
                      type="button"
                      className="absolute top-1 left-1 h-7 w-7 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-black/60 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation() // Prevent selection
                        handleViewImage(image)
                      }}
                      aria-label="View full size"
                    >
                      <Maximize className="h-3.5 w-3.5 text-white" />
                    </button>

                    {/* Selection indicator */}
                    {isSelected && (
                      <div className="absolute top-1 right-1 h-6 w-6 bg-primary rounded-full flex items-center justify-center">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          // Single image view - simplified with just the image
          <div className="flex-1 flex items-center justify-center p-4">
            {focusedImage && (
              <div className="max-h-full relative rounded-lg overflow-hidden">
                <img
                  src={focusedImage.url}
                  alt={`Generated content ${focusedImage.id}`}
                  className="max-h-[calc(100vh-120px)] object-contain"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action footer - only shown in grid view */}
      {viewMode === 'grid' && (
        <div className="px-4 py-3 bg-accent/5 border-t border-accent/10">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => setIsCompactView(!isCompactView)}
                title={isCompactView ? 'Larger Grid' : 'Compact Grid'}
              >
                {isCompactView ? (
                  <LayoutGrid className="h-4 w-4" />
                ) : (
                  <Grid className="h-4 w-4" />
                )}
              </Button>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-full"
                disabled={selectedImageIds.size === 0}
                onClick={onSave}
                title="Save to your private gallery"
              >
                <Pocket className="h-4 w-4" />
              </Button>

              <Button
                variant="default"
                size="sm"
                className="rounded-full px-4"
                disabled={selectedImageIds.size === 0}
                onClick={onPublish}
              >
                Publish{' '}
                {selectedImageIds.size > 0 && `(${selectedImageIds.size})`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
