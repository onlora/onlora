'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { Message, MessageImage } from '@/lib/api/jamApi'
import { cn } from '@/lib/utils'
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
  // These would be replaced with actual user data from context
  const userAvatarUrl = 'https://placehold.co/40x40/purple/white?text=U'
  const aiAvatarUrl = 'https://placehold.co/40x40/teal/white?text=AI'

  return (
    <div className="w-full h-full py-4 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto flex flex-col space-y-8">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              'flex items-start gap-3',
              message.role === 'user' ? 'justify-end' : 'justify-start',
            )}
          >
            {message.role === 'ai' && (
              <Avatar className="h-9 w-9 shadow-sm border-2 border-accent bg-accent/30">
                <AvatarImage src={aiAvatarUrl} alt="AI Avatar" />
                <AvatarFallback>AI</AvatarFallback>
              </Avatar>
            )}

            <div
              className={cn(
                'max-w-[75%] rounded-2xl px-5 py-3.5',
                message.role === 'user'
                  ? 'bg-primary/90 text-primary-foreground shadow-md'
                  : 'bg-accent/40 text-foreground shadow-sm',
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

            {message.role === 'user' && (
              <Avatar className="h-9 w-9 shadow-sm border-2 border-primary/30 bg-primary/10">
                <AvatarImage src={userAvatarUrl} alt="User Avatar" />
                <AvatarFallback>U</AvatarFallback>
              </Avatar>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start items-start gap-3">
            <Avatar className="h-9 w-9 shadow-sm border-2 border-accent bg-accent/30">
              <AvatarImage src={aiAvatarUrl} alt="AI Avatar" />
              <AvatarFallback>AI</AvatarFallback>
            </Avatar>
            <div className="bg-accent/40 text-foreground shadow-sm rounded-2xl px-5 py-3.5">
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
