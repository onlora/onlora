'use client'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ApiError } from '@/lib/api/apiClient'
import {
  type AIModelData as ApiAIModelData,
  getGenerationModels,
} from '@/lib/api/modelApi'
import { useQuery } from '@tanstack/react-query'
import {
  BrainCircuit,
  Image,
  LayoutGrid,
  SendHorizontal,
  Sliders,
} from 'lucide-react'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'

// Define possible image sizes
type ImageSize = '512x512' | '768x768' | '1024x1024'
type AspectRatio = '1:1' | '2:3' | '4:3' | '9:16' | '16:9'
type AIModel = string

interface ChatInputProps {
  onSubmit: (message: string) => void
  isLoading?: boolean
  selectedSize: ImageSize
  onSizeChange: (size: ImageSize) => void
  jamId: string | null
  selectedModel?: AIModel
  onModelChange?: (model: AIModel) => void
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSubmit,
  isLoading: isSubmitting = false,
  selectedSize,
  onSizeChange,
  jamId,
  selectedModel = '',
  onModelChange,
}) => {
  const [inputValue, setInputValue] = useState('')
  const [showRatioSelector, setShowRatioSelector] = useState(false)
  const [currentModel, setCurrentModel] = useState<AIModel>(selectedModel || '')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const {
    data: availableModels = [],
    isLoading: modelsLoading,
    error: modelsErrorData,
  } = useQuery<ApiAIModelData[], Error>({
    queryKey: ['generationModels'],
    queryFn: getGenerationModels,
    staleTime: 5 * 60 * 1000,
  })

  const modelsError = modelsErrorData
    ? (modelsErrorData as ApiError)?.message || modelsErrorData.message
    : null

  useEffect(() => {
    if (modelsLoading || !availableModels) return

    let modelToSet: AIModel = ''

    if (availableModels.length > 0) {
      const selectedModelInList =
        selectedModel && availableModels.find((m) => m.value === selectedModel)
      const currentModelInList =
        currentModel && availableModels.find((m) => m.value === currentModel)

      if (selectedModel && selectedModelInList) {
        modelToSet = selectedModel
      } else if (currentModelInList) {
        modelToSet = currentModel
      } else {
        modelToSet = availableModels[0].value
      }
    } else {
      modelToSet = ''
    }

    if (modelToSet !== currentModel) {
      setCurrentModel(modelToSet)
    }
    if (onModelChange && modelToSet !== selectedModel) {
      onModelChange(modelToSet)
    }
  }, [
    availableModels,
    selectedModel,
    modelsLoading,
    onModelChange,
    currentModel,
  ])

  useEffect(() => {
    if (selectedModel && selectedModel !== currentModel) {
      if (availableModels.some((m) => m.value === selectedModel)) {
        setCurrentModel(selectedModel)
      } else if (availableModels.length > 0 && !modelsLoading) {
        console.warn(
          `selectedModel prop "${selectedModel}" is not currently available.`,
        )
      }
    }
  }, [selectedModel, availableModels, currentModel, modelsLoading])

  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${textarea.scrollHeight}px`
    }
  }, [])

  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea && inputValue) {
      textarea.style.height = 'auto'
      textarea.style.height = `${textarea.scrollHeight}px`
    }
  }, [inputValue])

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(event.target.value)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (inputValue.trim() && !isSubmitting) {
        onSubmit(inputValue)
        setInputValue('')
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto'
        }
      }
    }
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!inputValue.trim() || isSubmitting) return

    onSubmit(inputValue)
    setInputValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  const handleModelChange = (modelValue: AIModel) => {
    setCurrentModel(modelValue)
    if (onModelChange) {
      onModelChange(modelValue)
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
          <textarea
            ref={textareaRef}
            placeholder="Describe your image, characters, emotions, scene, style..."
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={isSubmitting}
            rows={1}
            className="w-full outline-none bg-transparent resize-none text-zinc-800 placeholder-zinc-400 min-h-[24px] max-h-[200px] overflow-y-auto"
            autoComplete="off"
          />

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

          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              console.log('File selected:', e.target.files?.[0]?.name)
            }}
          />

          <div className="flex justify-between items-center mt-2">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                className="p-1.5 rounded text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 transition-colors"
                onClick={handleFileUpload}
                aria-label="Add reference image"
                title="Add reference image"
              >
                <Image className="w-4 h-4" />
              </button>

              <button
                type="button"
                className="p-1.5 rounded text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 transition-colors"
                onClick={() => setShowRatioSelector(!showRatioSelector)}
                aria-label="Change aspect ratio"
                title="Change aspect ratio"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>

              <button
                type="button"
                className="p-1.5 rounded text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 transition-colors"
                aria-label="Select style"
                title="Select style"
              >
                <Sliders className="w-4 h-4" />
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex items-center gap-1 h-auto p-1.5 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700"
                    disabled={modelsLoading}
                  >
                    <BrainCircuit className="w-4 h-4" />
                    <span className="text-xs font-medium">
                      {modelsLoading
                        ? 'Loading...'
                        : currentModel || 'Select Model'}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  <DropdownMenuLabel>Select AI Model</DropdownMenuLabel>
                  {modelsError && (
                    <div className="p-2 text-xs text-red-500">
                      {modelsError}
                    </div>
                  )}
                  {!modelsLoading &&
                    !modelsError &&
                    (!availableModels || availableModels.length === 0) && (
                      <div className="p-2 text-xs text-zinc-500">
                        No models available.
                      </div>
                    )}
                  <DropdownMenuRadioGroup
                    value={currentModel}
                    onValueChange={handleModelChange}
                  >
                    {availableModels.map((model: ApiAIModelData) => (
                      <DropdownMenuRadioItem
                        key={model.value}
                        value={model.value}
                      >
                        <div className="flex flex-col">
                          <span className="font-medium">{model.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {model.description}
                          </span>
                        </div>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !inputValue.trim()}
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
