'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SendHorizontal } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'

interface ChatInputProps {
  onSubmit: (message: string) => void // Function to call when message is submitted
  isLoading?: boolean // Optional flag to indicate loading state
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSubmit,
  isLoading = false,
}) => {
  const [inputValue, setInputValue] = useState('')

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value)
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!inputValue.trim() || isLoading) return // Don't submit empty or while loading

    // console.log('Submitting message:', inputValue);
    onSubmit(inputValue)
    setInputValue('') // Clear input after submission
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 border-t bg-card">
      <div className="flex items-center space-x-2">
        <Input
          type="text"
          placeholder="Enter your prompt..."
          value={inputValue}
          onChange={handleInputChange}
          disabled={isLoading} // Disable input when loading
          className="flex-1"
        />
        <Button
          type="submit"
          size="icon"
          disabled={isLoading || !inputValue.trim()}
        >
          {/* TODO: Show loading spinner when isLoading is true? */}
          <SendHorizontal className="h-4 w-4" />
          <span className="sr-only">Send</span>
        </Button>
      </div>
    </form>
  )
}
