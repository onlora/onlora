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
  jamId: string | null // Add jamId prop, can be null if it's a new jam not yet created
}

export const JamToolbar: React.FC<JamToolbarProps> = ({
  selectedSize,
  onSizeChange,
  jamId,
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
        <Link
          href={
            jamId && jamId !== 'new'
              ? `/gallery?fromJamId=${jamId}`
              : '/gallery'
          }
          passHref
          legacyBehavior
        >
          <Button
            variant="ghost"
            size="icon"
            aria-label="My Gallery"
            title="My Gallery"
            disabled={!jamId || jamId === 'new'} // Disable if jamId is not yet available
          >
            <GalleryHorizontalEnd className="h-5 w-5" />
          </Button>
        </Link>
      </div>
    </div>
  )
}
