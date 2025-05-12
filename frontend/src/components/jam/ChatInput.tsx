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
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import {
  BrainCircuit,
  LayoutGrid,
  SendHorizontal,
  Settings,
  SquareIcon,
} from 'lucide-react'
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
  currentModelId?: string | null
  onModelChange?: (model: ApiAIModelData | null) => void
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSubmit,
  isLoading: isSubmitting = false,
  selectedSize,
  onSizeChange,
  jamId,
  currentModelId: currentModelIdFromProp = null,
  onModelChange,
}) => {
  const [inputValue, setInputValue] = useState('')
  const [currentModel, setCurrentModel] = useState<ApiAIModelData | null>(null)

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

    let modelToSet: ApiAIModelData | null = null
    let modelSource = 'init' // For debugging: init, prop, current, default

    if (availableModels.length > 0) {
      const firstAvailableModel = availableModels[0]

      const propModelInList =
        currentModelIdFromProp &&
        availableModels.find((m) => m.value === currentModelIdFromProp)

      if (currentModelIdFromProp && propModelInList) {
        modelToSet = propModelInList
        modelSource = 'prop_valid'
      } else if (currentModelIdFromProp && !propModelInList) {
        modelToSet = firstAvailableModel
        modelSource = 'prop_invalid_defaulting'
        console.warn(
          `ChatInput: currentModelId prop "${currentModelIdFromProp}" is not in available API models. Defaulting to "${firstAvailableModel.value}".`,
        )
      } else {
        const currentModelStillInList =
          currentModel &&
          availableModels.find((m) => m.value === currentModel.value)

        if (currentModelStillInList) {
          modelToSet = currentModel
          modelSource = 'current_valid'
        } else {
          modelToSet = firstAvailableModel
          modelSource = 'default_to_first'
        }
      }
    } else {
      modelToSet = null
      modelSource = 'no_models_from_api'
    }

    if (modelToSet?.value !== currentModel?.value) {
      setCurrentModel(modelToSet)
      if (onModelChange) {
        onModelChange(modelToSet)
      }
    } else if (
      onModelChange &&
      modelToSet?.value !== currentModelIdFromProp &&
      modelSource !== 'prop_valid'
    ) {
      onModelChange(modelToSet)
    }
  }, [
    availableModels,
    currentModelIdFromProp,
    modelsLoading,
    onModelChange,
    currentModel,
  ])

  useEffect(() => {
    if (modelsLoading || !availableModels || availableModels.length === 0)
      return

    if (
      currentModelIdFromProp &&
      currentModelIdFromProp !== currentModel?.value
    ) {
      const newModelFromProp = availableModels.find(
        (m) => m.value === currentModelIdFromProp,
      )
      if (newModelFromProp) {
        setCurrentModel(newModelFromProp)
      } else {
        console.warn(
          `ChatInput (Prop Sync Effect): currentModelIdFromProp "${currentModelIdFromProp}" changed but is not in available API models. Main effect should handle defaulting.`,
        )
      }
    } else if (!currentModelIdFromProp && currentModel !== null) {
    }
  }, [currentModelIdFromProp, currentModel, availableModels, modelsLoading])

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

  const handleModelChangeInternal = (modelValueId: string) => {
    const selectedFullModel =
      availableModels.find((m) => m.value === modelValueId) || null
    setCurrentModel(selectedFullModel)
    if (onModelChange) {
      onModelChange(selectedFullModel)
    }
  }

  // Size option mapping for displaying in dropdown
  const sizeOptions = [
    {
      value: '512x512',
      label: '512×512',
      icon: <SquareIcon className="h-3.5 w-3.5" />,
    },
    {
      value: '768x768',
      label: '768×768',
      icon: <SquareIcon className="h-4 w-4" />,
    },
    {
      value: '1024x1024',
      label: '1024×1024',
      icon: <SquareIcon className="h-4.5 w-4.5" />,
    },
  ]

  // Get the current size option
  const currentSizeOption =
    sizeOptions.find((option) => option.value === selectedSize) ||
    sizeOptions[2]

  return (
    <div className="flex-shrink-0 z-10">
      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
        <div className="relative w-full rounded-xl bg-accent/20 shadow-sm">
          <div className="flex items-center px-4 py-2 border-b border-accent/10">
            {/* Model selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-2 text-sm text-foreground/70 rounded-full hover:bg-accent/40"
                >
                  <BrainCircuit className="h-3.5 w-3.5" />
                  <span className="max-w-[120px] truncate">
                    {currentModel?.label || 'Select model'}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>AI Model</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={currentModel?.value || ''}
                  onValueChange={handleModelChangeInternal}
                >
                  {availableModels.map((model) => (
                    <DropdownMenuRadioItem
                      key={model.value}
                      value={model.value}
                      disabled={modelsLoading}
                    >
                      {model.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="mx-2 h-4 border-r border-accent/20" />

            {/* Size selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-2 text-sm text-foreground/70 rounded-full hover:bg-accent/40"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span>{currentSizeOption.label}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuLabel>Image Size</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={selectedSize}
                  onValueChange={(value) => onSizeChange(value as ImageSize)}
                >
                  {sizeOptions.map((option) => (
                    <DropdownMenuRadioItem
                      key={option.value}
                      value={option.value}
                      className="flex items-center"
                    >
                      <span className="mr-2">{option.icon}</span>
                      {option.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="ml-auto">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 rounded-full hover:bg-accent/40"
              >
                <Settings className="h-3.5 w-3.5 text-foreground/70" />
              </Button>
            </div>
          </div>

          <div className="px-4 py-3 flex">
            <textarea
              ref={textareaRef}
              placeholder="Describe your image, characters, emotions, scene, style..."
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={isSubmitting}
              rows={1}
              className="w-full outline-none bg-transparent resize-none text-foreground placeholder-muted-foreground min-h-[24px] max-h-[200px] overflow-y-auto"
              autoComplete="off"
            />
          </div>

          <div className="px-4 py-2 flex justify-end border-t border-accent/10">
            <Button
              type="submit"
              disabled={!inputValue.trim() || isSubmitting}
              className={cn(
                'rounded-full h-8 gap-1.5 px-4 transition-all',
                !inputValue.trim() && 'opacity-70',
              )}
              size="sm"
            >
              {isSubmitting ? (
                <div className="flex space-x-1">
                  <div className="h-1.5 w-1.5 bg-primary-foreground/80 rounded-full animate-bounce" />
                  <div className="h-1.5 w-1.5 bg-primary-foreground/80 rounded-full animate-bounce [animation-delay:150ms]" />
                  <div className="h-1.5 w-1.5 bg-primary-foreground/80 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              ) : (
                <>
                  <span>Generate</span>
                  <SendHorizontal className="h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
