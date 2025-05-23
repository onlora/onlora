'use client'

import { cn } from '@/lib/utils'
import type { Message, MessageImage } from '@/types/images'
import type React from 'react'

interface MessageListProps {
  messages: Message[]
  isLoading?: boolean
  onImageClick?: (image: MessageImage) => void
  isPanelOpen?: boolean
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  isLoading = false,
  onImageClick = () => {},
  isPanelOpen = false,
}) => {
  return (
    <div className="w-full h-full py-4 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto flex flex-col space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              'flex items-start',
              message.role === 'user' ? 'justify-end' : 'justify-start',
            )}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-2xl px-5 py-3.5',
                message.role === 'user'
                  ? 'bg-primary/90 text-primary-foreground shadow-sm'
                  : 'bg-accent/40 text-foreground shadow-sm',
                // Add different border radius for user vs AI messages
                message.role === 'user' ? 'rounded-tr-sm' : 'rounded-tl-sm',
              )}
            >
              {message.text && (
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {message.text}
                </p>
              )}

              {message.images && message.images.length > 0 && (
                <div
                  className={cn(
                    'mt-4 grid gap-2.5',
                    message.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
                  )}
                >
                  {message.images.map((img: MessageImage) => (
                    <button
                      key={img.id}
                      type="button"
                      className={cn(
                        'relative aspect-square overflow-hidden rounded-xl p-0 border-0 cursor-pointer group transform transition-all duration-200',
                        isPanelOpen
                          ? 'max-w-[220px] hover:scale-[1.02] hover:shadow-lg'
                          : 'max-w-[280px] hover:scale-105 hover:shadow-md',
                      )}
                      onClick={() => onImageClick(img)}
                      aria-label={`Open and view content ${img.id}`}
                    >
                      <img
                        src={img.url}
                        alt={`Generated content ${img.id}`}
                        className="object-cover w-full h-full"
                        sizes="(max-width: 768px) 50vw, 33vw"
                      />
                      {/* Hover effect */}
                      <div
                        className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent 
                        opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center p-3"
                      >
                        <span className="text-white text-xs bg-black/50 px-2.5 py-1 rounded-full backdrop-blur-sm">
                          View
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start items-start">
            <div className="bg-accent/40 text-foreground shadow-sm rounded-2xl rounded-tl-sm px-5 py-3.5">
              <div className="flex space-x-2 items-center">
                <div className="h-2.5 w-2.5 bg-muted-foreground/40 rounded-full animate-bounce" />
                <div className="h-2.5 w-2.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:200ms]" />
                <div className="h-2.5 w-2.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:400ms]" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
