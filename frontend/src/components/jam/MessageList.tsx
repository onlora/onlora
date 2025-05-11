'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { Message, MessageImage } from '@/lib/api/jamApi'
import { cn } from '@/lib/utils'
import Image from 'next/image'
import type React from 'react'

interface MessageListProps {
  messages: Message[]
  isLoading?: boolean
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  isLoading = false,
}) => {
  // These would be replaced with actual user data from context
  const userAvatarUrl = 'https://placehold.co/40x40/purple/white?text=U'
  const aiAvatarUrl = 'https://placehold.co/40x40/teal/white?text=AI'

  return (
    <div className="flex-1 py-4 px-4 sm:px-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto flex flex-col space-y-6">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              'flex items-start gap-3',
              message.role === 'user' ? 'justify-end' : 'justify-start',
            )}
          >
            {message.role === 'ai' && (
              <Avatar className="h-8 w-8 shadow-sm">
                <AvatarImage src={aiAvatarUrl} alt="AI Avatar" />
                <AvatarFallback>AI</AvatarFallback>
              </Avatar>
            )}

            <div
              className={cn(
                'max-w-[75%] rounded-2xl px-4 py-3',
                message.role === 'user'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/50 text-foreground shadow-sm',
              )}
            >
              {message.text && (
                <p className="text-sm whitespace-pre-wrap mb-2">
                  {message.text}
                </p>
              )}

              {message.images && message.images.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {message.images.map((img: MessageImage) => (
                    <div
                      key={img.id}
                      className="relative aspect-square overflow-hidden rounded-xl"
                    >
                      <Image
                        src={img.url}
                        alt={`Generated image ${img.id}`}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 50vw, 33vw"
                      />
                    </div>
                  ))}
                </div>
              )}

              {message.created_at && (
                <div className="text-[10px] opacity-60 mt-1 text-right">
                  {new Date(message.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              )}
            </div>

            {message.role === 'user' && (
              <Avatar className="h-8 w-8 shadow-sm">
                <AvatarImage src={userAvatarUrl} alt="User Avatar" />
                <AvatarFallback>U</AvatarFallback>
              </Avatar>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start items-start gap-3">
            <Avatar className="h-8 w-8 shadow-sm">
              <AvatarImage src={aiAvatarUrl} alt="AI Avatar" />
              <AvatarFallback>AI</AvatarFallback>
            </Avatar>
            <div className="bg-muted/50 text-foreground shadow-sm rounded-2xl px-4 py-3">
              <div className="flex space-x-2 items-center">
                <div className="h-2 w-2 bg-muted-foreground/40 rounded-full animate-bounce" />
                <div className="h-2 w-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:200ms]" />
                <div className="h-2 w-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:400ms]" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
