'use client'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChevronDown, Flame, GalleryHorizontalEnd } from 'lucide-react'
import Link from 'next/link'
import type React from 'react'

// Define possible image sizes
export type ImageSize = '512x512' | '768x768' | '1024x1024'

interface JamToolbarProps {
  selectedSize: ImageSize
  onSizeChange: (size: ImageSize) => void
  // TODO: Add props for jamId or other context if needed for links
}

export const JamToolbar: React.FC<JamToolbarProps> = ({
  selectedSize,
  onSizeChange,
}) => {
  return (
    <div className="p-2 px-4 border-b bg-card flex justify-between items-center">
      {/* Left side controls (e.g., Hot Vibes) */}
      <div>
        {/* Placeholder for Hot Vibes - Link or Action TBD */}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Hot Vibes"
          disabled
          title="Hot Vibes (Coming Soon)"
        >
          <Flame className="h-5 w-5" />
        </Button>
      </div>

      {/* Center controls (e.g., Size) */}
      <div className="flex-1 flex justify-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-[140px]">
              {selectedSize}
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[140px]">
            <DropdownMenuRadioGroup
              value={selectedSize}
              onValueChange={(value) => onSizeChange(value as ImageSize)}
            >
              <DropdownMenuRadioItem value="512x512">
                512x512
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="768x768">
                768x768
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="1024x1024">
                1024x1024
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Right side controls (e.g., Gallery) */}
      <div>
        {/* Link to Gallery - Adjust href as needed */}
        <Link href="/gallery" passHref legacyBehavior>
          <Button
            variant="ghost"
            size="icon"
            aria-label="My Gallery"
            title="My Gallery"
          >
            <GalleryHorizontalEnd className="h-5 w-5" />
          </Button>
        </Link>
      </div>
    </div>
  )
}
