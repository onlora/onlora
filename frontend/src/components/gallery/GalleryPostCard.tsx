'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import type { ProfilePostItem } from '@/lib/api/userApi'
import { cn } from '@/lib/utils'
import { ImageIcon } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

interface GalleryPostCardProps {
  post: ProfilePostItem
  isSelected: boolean
  selectionMode: boolean
  onToggleSelect: (postId: number) => void
}

export const GalleryPostCard = ({
  post,
  isSelected,
  selectionMode,
  onToggleSelect,
}: GalleryPostCardProps) => {
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (selectionMode) {
      e.preventDefault() // Prevent link navigation in selection mode
      onToggleSelect(post.id)
    }
  }

  const content = (
    <Card
      className={cn(
        'overflow-hidden transition-all group h-full flex flex-col',
        selectionMode ? 'cursor-pointer hover:shadow-md' : 'hover:shadow-lg',
        isSelected
          ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
          : '',
      )}
    >
      <div className="relative aspect-square w-full bg-muted overflow-hidden">
        {/* Selection Checkbox/Overlay */}
        {selectionMode && (
          <div
            className="absolute top-2 left-2 z-10 bg-background/80 rounded-sm p-0.5 border border-border"
            onClick={(e) => {
              // Prevent card click from triggering when clicking checkbox itself
              e.stopPropagation()
              onToggleSelect(post.id)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation()
                onToggleSelect(post.id)
              }
            }}
            role="checkbox"
            aria-checked={isSelected}
            tabIndex={0}
          >
            <Checkbox
              checked={isSelected}
              className="h-4 w-4 pointer-events-none"
            />
          </div>
        )}

        {post.coverImg ? (
          <Image
            src={post.coverImg}
            alt={post.title || `Vibe ${post.id}`}
            fill
            className={cn(
              'object-cover transition-transform duration-300',
              !selectionMode ? 'group-hover:scale-105' : '',
            )}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ImageIcon className="h-12 w-12 text-muted-foreground" />
          </div>
        )}
      </div>
      <CardContent className="p-2 flex-grow flex flex-col justify-between">
        {post.title && (
          <p className="font-semibold truncate text-sm mb-1 leading-tight">
            {post.title}
          </p>
        )}
        <div className="text-xs text-muted-foreground flex justify-between items-center mt-auto">
          {/* Optionally show visibility status? */}
          <span>Likes: {post.likeCount ?? 0}</span>
          <span>Views: {post.viewCount ?? 0}</span>
        </div>
      </CardContent>
    </Card>
  )

  // Render as a Link only when not in selection mode
  return selectionMode ? (
    <div
      onClick={handleClick}
      onKeyDown={(e) => {
        // Trigger selection on Enter or Space when in selection mode
        if (selectionMode && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault() // Prevent potential scroll/activate from Space key
          onToggleSelect(post.id)
        }
      }}
      role="button" // Role indicating it's clickable
      aria-pressed={isSelected} // Use aria-pressed for toggle button role
      tabIndex={0} // Make it focusable
      className="h-full block focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-lg"
    >
      {content}
    </div>
  ) : (
    <Link href={`/posts/${post.id}`} className="block h-full">
      {content}
    </Link>
  )
}
