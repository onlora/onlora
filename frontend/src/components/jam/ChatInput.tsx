'use client'

import { Image, LayoutGrid, SendHorizontal, Sliders } from 'lucide-react'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'

// Define possible image sizes
type ImageSize = '512x512' | '768x768' | '1024x1024'
type AspectRatio = '1:1' | '2:3' | '4:3' | '9:16' | '16:9'

interface ChatInputProps {
  onSubmit: (message: string) => void
  isLoading?: boolean
  selectedSize: ImageSize
  onSizeChange: (size: ImageSize) => void
  jamId: string | null
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSubmit,
  isLoading = false,
  selectedSize,
  onSizeChange,
  jamId,
}) => {
  const [inputValue, setInputValue] = useState('')
  const [showRatioSelector, setShowRatioSelector] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Update height when input value changes
  useEffect(() => {
    // Auto-resize textarea based on content
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${textarea.scrollHeight}px`
    }
  }, [inputValue])

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(event.target.value)
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!inputValue.trim() || isLoading) return

    onSubmit(inputValue)
    setInputValue('')
    // Reset height after submission
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  const aspectRatios: {
    value: AspectRatio
    label: string
    description: string
  }[] = [
    { value: '1:1', label: '1:1', description: 'Square, Profile' },
    { value: '2:3', label: '2:3', description: 'Social Media, Selfie' },
    { value: '4:3', label: '4:3', description: 'Article, Painting' },
    { value: '9:16', label: '9:16', description: 'Mobile Wallpaper, Portrait' },
    {
      value: '16:9',
      label: '16:9',
      description: 'Desktop Wallpaper, Landscape',
    },
  ]

  return (
    <div className="p-4 bg-background flex-shrink-0 z-10">
      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
        <div className="relative w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
          {/* Textarea for input */}
          <textarea
            ref={textareaRef}
            placeholder="Describe your image, characters, emotions, scene, style..."
            value={inputValue}
            onChange={handleInputChange}
            disabled={isLoading}
            rows={1}
            className="w-full outline-none bg-transparent resize-none text-zinc-800 placeholder-zinc-400 min-h-[24px] max-h-[200px] overflow-y-auto"
            autoComplete="off"
          />

          {/* Aspect ratio selector popup */}
          {showRatioSelector && (
            <div className="absolute bottom-14 left-0 bg-white rounded-xl shadow-lg border border-zinc-200 p-1 z-10 w-64 overflow-hidden">
              <div className="text-sm font-medium text-zinc-800 p-2 border-b border-zinc-100">
                Aspect Ratio
              </div>
              <div className="py-1">
                {aspectRatios.map((ratio) => (
                  <button
                    key={ratio.value}
                    type="button"
                    className="flex w-full items-center px-3 py-2 hover:bg-zinc-50 text-left bg-transparent border-0 transition-colors"
                    onClick={() => {
                      // Handle ratio selection
                      setShowRatioSelector(false)
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        id={`ratio-${ratio.value}`}
                        name="aspect-ratio"
                        className="h-4 w-4 text-primary border-zinc-300"
                      />
                      <label
                        htmlFor={`ratio-${ratio.value}`}
                        className="text-sm font-medium text-zinc-700"
                      >
                        {ratio.label}
                      </label>
                    </div>
                    <div className="text-xs text-zinc-500 ml-6">
                      {ratio.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              // Handle file change
              console.log('File selected:', e.target.files?.[0]?.name)
            }}
          />

          {/* Bottom toolbar */}
          <div className="flex justify-between items-center mt-2">
            <div className="flex items-center space-x-2">
              {/* Reference Image Button */}
              <button
                type="button"
                className="p-1.5 rounded text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 transition-colors"
                onClick={handleFileUpload}
                aria-label="Add reference image"
                title="Add reference image"
              >
                <Image className="w-4 h-4" />
              </button>

              {/* Ratio Button */}
              <button
                type="button"
                className="p-1.5 rounded text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 transition-colors"
                onClick={() => setShowRatioSelector(!showRatioSelector)}
                aria-label="Change aspect ratio"
                title="Change aspect ratio"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>

              {/* Style Button */}
              <button
                type="button"
                className="p-1.5 rounded text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 transition-colors"
                aria-label="Select style"
                title="Select style"
              >
                <Sliders className="w-4 h-4" />
              </button>
            </div>

            {/* Send Button */}
            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Send message"
            >
              <SendHorizontal className="h-4 w-4" />
              <span className="sr-only">Send</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
