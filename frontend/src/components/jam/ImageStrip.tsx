'use client'

import { Card } from '@/components/ui/card'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import type { MessageImage } from '@/lib/api/jamApi' // Import shared type
import { cn } from '@/lib/utils'
import Image from 'next/image'
import type React from 'react'

interface ImageStripProps {
  images: MessageImage[]
  selectedImageIds?: Set<number> // Optional: Set of selected image IDs
  onImageSelect?: (imageId: number) => void // Optional: Callback for selection
  // Add other props like loading state if needed
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
  images = placeholderStripImages, // Use placeholder as default for now
  selectedImageIds = new Set(),
  onImageSelect = () => {},
}) => {
  if (!images || images.length === 0) {
    // Optionally render a placeholder or empty state
    return (
      <div className="h-32 border-t bg-muted/20 flex items-center justify-center text-sm text-muted-foreground">
        No images generated yet.
      </div>
    )
  }

  return (
    <div className="border-t bg-background p-2">
      <ScrollArea className="w-full whitespace-nowrap rounded-md">
        <div className="flex w-max space-x-2 p-2">
          {images.map((image) => {
            const isSelected = selectedImageIds.has(image.id)
            return (
              <Card
                key={image.id}
                className={cn(
                  'relative h-24 w-24 shrink-0 overflow-hidden transition-all hover:scale-105 cursor-pointer',
                  isSelected
                    ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                    : '',
                )}
                onClick={() => onImageSelect(image.id)}
              >
                <Image
                  src={image.url}
                  alt={`Generated image ${image.id}`}
                  fill
                  className="object-cover"
                  sizes="100px" // Approximate size for optimization
                />
                {/* Optional: Add overlay/check mark for selected state */}
                {isSelected && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-6 w-6 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <title>Selected</title>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  )
}
