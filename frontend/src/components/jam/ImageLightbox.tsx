'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import Image from 'next/image'

interface ImageLightboxProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  imageUrl?: string | null
  altText?: string
}

export function ImageLightbox({
  isOpen,
  onOpenChange,
  imageUrl,
  altText = 'Lightbox image',
}: ImageLightboxProps) {
  if (!imageUrl) return null

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{altText}</DialogTitle>
        </DialogHeader>
        <div className="relative aspect-video w-full h-auto">
          <Image
            src={imageUrl}
            alt={altText}
            fill
            className="object-contain"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 700px"
          />
        </div>
        {/* DialogClose is not strictly needed if onOpenChange handles Escape and overlay click */}
      </DialogContent>
    </Dialog>
  )
}
