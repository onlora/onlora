'use client'

import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import type { MessageImage } from '@/lib/api/jamApi'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'
import Image from 'next/image'
import type React from 'react'

interface ImageStripProps {
  images: MessageImage[]
  selectedImageIds?: Set<number>
  onImageSelect?: (imageId: number) => void
  onImageActivate?: (image: MessageImage) => void
}

// Placeholder images for development
const placeholderStripImages: MessageImage[] = [
  {
    id: 101,
    url: 'https://placehold.co/128x128/orange/white?text=AI+1',
  },
  {
    id: 102,
    url: 'https://placehold.co/128x128/blue/white?text=AI+2',
  },
  {
    id: 103,
    url: 'https://placehold.co/128x128/green/white?text=AI+3',
  },
  {
    id: 104,
    url: 'https://placehold.co/128x128/red/white?text=AI+4',
  },
  {
    id: 105,
    url: 'https://placehold.co/128x128/purple/white?text=AI+5',
  },
]

export const ImageStrip: React.FC<ImageStripProps> = ({
  images = placeholderStripImages,
  selectedImageIds = new Set(),
  onImageSelect = () => {},
  onImageActivate = () => {},
}) => {
  if (!images || images.length === 0) {
    return (
      <div className="h-28 border-t bg-background flex items-center justify-center text-sm text-muted-foreground px-4 text-center">
        No images generated yet. Type a prompt and hit generate.
      </div>
    )
  }

  return (
    <div className="border-t bg-background/80 py-3 px-2 flex-shrink-0">
      <ScrollArea className="w-full rounded-lg">
        <div className="flex space-x-3 px-2">
          {images.map((image) => {
            const isSelected = selectedImageIds.has(image.id)
            return (
              <button
                key={image.id}
                type="button"
                className={cn(
                  'relative h-28 w-28 shrink-0 rounded-lg overflow-hidden transition-all cursor-pointer group border-0 p-0',
                  isSelected
                    ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                    : 'hover:ring-1 hover:ring-primary/40 hover:ring-offset-1 hover:ring-offset-background',
                )}
                onClick={() => {
                  onImageSelect(image.id)
                  onImageActivate(image)
                }}
                aria-label={`Generated image ${image.id}${isSelected ? ' (selected)' : ''}`}
              >
                <Image
                  src={image.url}
                  alt={`Generated image ${image.id}`}
                  fill
                  className="object-cover"
                  sizes="112px"
                />

                {/* Selection indicator */}
                <div
                  className={cn(
                    'absolute top-2 right-2 h-5 w-5 rounded-full flex items-center justify-center transition-all',
                    isSelected
                      ? 'bg-primary'
                      : 'bg-black/30 opacity-0 group-hover:opacity-100',
                  )}
                >
                  {isSelected && <Check className="h-3 w-3 text-white" />}
                </div>

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )
          })}
        </div>
        <ScrollBar orientation="horizontal" className="h-1.5" />
      </ScrollArea>
    </div>
  )
}
