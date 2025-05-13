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
import { getGenerationModels } from '@/lib/api/modelApi'
import { cn } from '@/lib/utils'
import type { AIModelData, ImageSize } from '@/types/models'
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

interface ChatInputProps {
  onSubmit: (message: string) => void
  isLoading?: boolean
  selectedSize: ImageSize
  onSizeChange: (size: ImageSize) => void
  jamId: string | null
  currentModelId?: string | null
  onModelChange?: (model: AIModelData | null) => void
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
  const [currentModel, setCurrentModel] = useState<AIModelData | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const {
    data: availableModels = [],
    isLoading: modelsLoading,
    error: modelsErrorData,
  } = useQuery<AIModelData[], Error>({
    queryKey: ['generationModels'],
    queryFn: getGenerationModels,
    staleTime: 5 * 60 * 1000,
  })

  const modelsError = modelsErrorData
    ? (modelsErrorData as ApiError)?.message || modelsErrorData.message
    : null

  useEffect(() => {
    if (modelsLoading || !availableModels) return

    let modelToSet: AIModelData | null = null
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

  // Default size options if model doesn't specify any
  const defaultSizeOptions = [
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

  // Default aspect ratio options if model uses aspect ratios
  const defaultAspectRatioOptions = [
    {
      value: '1:1',
      label: '1:1 (Square)',
      icon: <SquareIcon className="h-4 w-4" />,
    },
    {
      value: '16:9',
      label: '16:9 (Landscape)',
      icon: <LayoutGrid className="h-4 w-4" />,
    },
    {
      value: '9:16',
      label: '9:16 (Portrait)',
      icon: <LayoutGrid className="h-4 w-4 rotate-90" />,
    },
  ]

  // Determine what options to show based on the selected model
  const isUsingAspectRatio =
    currentModel?.supportedAspectRatios &&
    currentModel.supportedAspectRatios.length > 0

  // Generate size options based on model's supported sizes if available
  const sizeOptions = currentModel?.supportedSizes
    ? currentModel.supportedSizes.map((size) => {
        const [width, height] = size.split('x').map(Number)
        const iconSize = Math.min(4.5, 3.5 + width / 1024)
        return {
          value: size,
          label: size.replace('x', '×'),
          icon: <SquareIcon className={`h-${iconSize} w-${iconSize}`} />,
        }
      })
    : defaultSizeOptions

  // Generate aspect ratio options based on model's supported aspect ratios if available
  const aspectRatioOptions = currentModel?.supportedAspectRatios
    ? currentModel.supportedAspectRatios.map((ratio) => {
        const [width, height] = ratio.split(':').map(Number)
        const isLandscape = width > height
        const isPortrait = height > width
        const isSquare = width === height

        return {
          value: ratio,
          label: `${ratio} ${isSquare ? '(Square)' : isLandscape ? '(Landscape)' : '(Portrait)'}`,
          icon: isSquare ? (
            <SquareIcon className="h-4 w-4" />
          ) : (
            <LayoutGrid
              className={`h-4 w-4 ${isPortrait ? 'rotate-90' : ''}`}
            />
          ),
        }
      })
    : defaultAspectRatioOptions

  // Determine which options to display
  const displayOptions = isUsingAspectRatio ? aspectRatioOptions : sizeOptions

  // Get the current option
  const currentOption =
    displayOptions.find(
      (option) =>
        option.value ===
        (isUsingAspectRatio ? selectedSize.replace('x', ':') : selectedSize),
    ) || displayOptions[0]

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

            {/* Size/Aspect Ratio selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-2 text-sm text-foreground/70 rounded-full hover:bg-accent/40"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span>
                    {currentOption?.label ||
                      (isUsingAspectRatio ? 'Aspect Ratio' : 'Size')}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuLabel>
                  {isUsingAspectRatio ? 'Aspect Ratio' : 'Image Size'}
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={
                    isUsingAspectRatio
                      ? selectedSize.replace('x', ':')
                      : selectedSize
                  }
                  onValueChange={(value) =>
                    onSizeChange(
                      isUsingAspectRatio
                        ? (value.replace(':', 'x') as ImageSize)
                        : (value as ImageSize),
                    )
                  }
                >
                  {displayOptions.map((option) => (
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
