'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Save, Send } from 'lucide-react'
import type React from 'react'

interface ActionBarProps {
  selectedCount: number
  onSave?: () => void // Placeholder for save action
  onPublish?: () => void // Placeholder for publish action
}

export const ActionBar: React.FC<ActionBarProps> = ({
  selectedCount,
  onSave,
  onPublish,
}) => {
  // Only render if at least one item is selected
  if (selectedCount === 0) {
    return null
  }

  return (
    <div
      className={cn(
        'absolute bottom-32 left-1/2 -translate-x-1/2 z-10', // Position above ImageStrip (adjust bottom value as needed)
        'p-2 bg-background border rounded-lg shadow-lg',
        'flex items-center space-x-3',
        // Animation for appearance (optional)
        'transition-all duration-300 ease-out',
        // Start slightly below and faded, move up and fade in
        'opacity-100 translate-y-0',
        // TODO: Add animation classes based on selectedCount > 0
        // Example using state/framer-motion would be better for smooth transitions
      )}
    >
      <span className="text-sm font-medium text-muted-foreground">
        {selectedCount} selected
      </span>
      <Button variant="outline" size="sm" onClick={onSave} disabled>
        {' '}
        {/* TODO: Implement Save */}
        <Save className="mr-2 h-4 w-4" />
        Save
      </Button>
      <Button size="sm" onClick={onPublish}>
        {' '}
        {/* TODO: Implement Publish */}
        <Send className="mr-2 h-4 w-4" />
        Publish
      </Button>
    </div>
  )
}
