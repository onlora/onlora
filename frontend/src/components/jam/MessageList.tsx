'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import type { Message, MessageImage } from '@/lib/api/jamApi'
import { cn } from '@/lib/utils'
import Image from 'next/image' // Use Next.js Image for optimization
import type React from 'react'

interface MessageListProps {
  messages: Message[]
  // TODO: Add props for user info (avatar), loading states, etc.
}

export const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  // TODO: Replace placeholderMessages with actual prop fetching logic

  // TODO: Get user avatar info from context or props
  const userAvatarUrl = 'https://placehold.co/40x40/purple/white?text=U'
  const aiAvatarUrl = 'https://placehold.co/40x40/teal/white?text=AI'

  return (
    <div className="flex-1 p-4 space-y-4 overflow-y-auto bg-muted/40">
      {messages.map((message) => (
        <div
          key={message.id}
          className={cn(
            'flex items-start gap-3',
            message.role === 'user' ? 'justify-end' : 'justify-start',
          )}
        >
          {message.role === 'ai' && (
            <Avatar className="h-8 w-8">
              <AvatarImage src={aiAvatarUrl} alt="AI Avatar" />
              <AvatarFallback>AI</AvatarFallback>
            </Avatar>
          )}
          <Card
            className={cn(
              'max-w-[75%] rounded-lg p-3',
              message.role === 'user'
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-card-foreground',
            )}
          >
            <CardContent className="p-0 text-sm">
              {message.text && (
                <p className="mb-2 whitespace-pre-wrap">{message.text}</p>
              )}
              {message.images && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {message.images?.map((img: MessageImage) => (
                    <div
                      key={img.id}
                      className="relative aspect-square overflow-hidden rounded-md"
                    >
                      <Image
                        src={img.url}
                        alt={`Generated image ${img.id}`}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 50vw, 200px"
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
            {/* Optional: Timestamp - needs better formatting */}
            {/* {message.createdAt && (
              <p className="text-xs text-muted-foreground mt-1 text-right">
                {new Date(message.createdAt).toLocaleTimeString()}
              </p>
            )} */}
          </Card>
          {message.role === 'user' && (
            <Avatar className="h-8 w-8">
              <AvatarImage src={userAvatarUrl} alt="User Avatar" />
              <AvatarFallback>U</AvatarFallback>
            </Avatar>
          )}
        </div>
      ))}
      {/* TODO: Add loading indicator? */}
    </div>
  )
}
 