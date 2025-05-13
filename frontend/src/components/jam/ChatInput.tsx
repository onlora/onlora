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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { ApiError } from '@/lib/api/apiClient'
import { getGenerationModels } from '@/lib/api/modelApi'
import { cn } from '@/lib/utils'
import type { AIModelData, ImageSize } from '@/types/models'
import { useQuery } from '@tanstack/react-query'
import {
  BrainCircuit,
  LayoutGrid,
  Loader2,
  SendHorizontal,
  Zap,
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

    // Check if model is actually changing
    const isModelChanging = modelToSet?.value !== currentModel?.value

    if (isModelChanging) {
      // First set the model
      setCurrentModel(modelToSet)
      if (onModelChange) {
        onModelChange(modelToSet)
      }

      // When model changes, set default size
      if (modelToSet) {
        // Determine whether to use aspect ratio or size
        const usesAspectRatio =
          modelToSet.supportedAspectRatios &&
          modelToSet.supportedAspectRatios.length > 0

        if (
          usesAspectRatio &&
          modelToSet.supportedAspectRatios &&
          modelToSet.supportedAspectRatios.length > 0
        ) {
          // Use the first supported aspect ratio, converted to API format
          const defaultRatio = modelToSet.supportedAspectRatios[0]
          onSizeChange(defaultRatio.replace(':', 'x') as ImageSize)
        } else if (
          modelToSet.supportedSizes &&
          modelToSet.supportedSizes.length > 0
        ) {
          // Use the first supported size
          onSizeChange(modelToSet.supportedSizes[0] as ImageSize)
        }
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
    onSizeChange,
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

  // Determine what options to show based on the selected model
  const isUsingAspectRatio =
    currentModel?.supportedAspectRatios &&
    currentModel.supportedAspectRatios.length > 0

  // Generate size options based on model's supported sizes
  const sizeOptions = currentModel?.supportedSizes
    ? currentModel.supportedSizes.map((size) => {
        return {
          value: size,
          label: size.replace('x', '×'),
        }
      })
    : []

  // Generate aspect ratio options based on model's supported aspect ratios
  const aspectRatioOptions = currentModel?.supportedAspectRatios
    ? currentModel.supportedAspectRatios.map((ratio) => {
        const [width, height] = ratio.split(':').map(Number)
        const isLandscape = width > height
        const isPortrait = height > width
        const isSquare = width === height

        return {
          value: ratio,
          label: `${ratio} ${isSquare ? '(Square)' : isLandscape ? '(Landscape)' : '(Portrait)'}`,
        }
      })
    : []

  // Determine which options to display
  const displayOptions = isUsingAspectRatio ? aspectRatioOptions : sizeOptions

  // Get the current option
  const currentOption =
    displayOptions.find(
      (option) =>
        option.value ===
        (isUsingAspectRatio ? selectedSize.replace('x', ':') : selectedSize),
    ) || (displayOptions.length > 0 ? displayOptions[0] : null)

  // To force UI update when model changes
  useEffect(() => {
    if (!currentModel) return

    // When current model changes, ensure we're using a compatible size
    const usesAspectRatio =
      currentModel.supportedAspectRatios &&
      currentModel.supportedAspectRatios.length > 0

    // Check if current size is compatible with current model
    let isSizeCompatible = false

    if (usesAspectRatio && currentModel.supportedAspectRatios) {
      const currentAspectRatio = selectedSize.replace('x', ':')
      isSizeCompatible =
        currentModel.supportedAspectRatios.includes(currentAspectRatio)
    } else if (currentModel.supportedSizes) {
      isSizeCompatible = currentModel.supportedSizes.includes(selectedSize)
    }

    // If size is not compatible, set to default
    if (!isSizeCompatible) {
      if (
        usesAspectRatio &&
        currentModel.supportedAspectRatios &&
        currentModel.supportedAspectRatios.length > 0
      ) {
        const defaultRatio = currentModel.supportedAspectRatios[0]
        onSizeChange(defaultRatio.replace(':', 'x') as ImageSize)
      } else if (
        currentModel.supportedSizes &&
        currentModel.supportedSizes.length > 0
      ) {
        onSizeChange(currentModel.supportedSizes[0] as ImageSize)
      }
    }
  }, [currentModel, selectedSize, onSizeChange])

  return (
    <div className="flex-shrink-0 z-10">
      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
        <div className="relative w-full rounded-xl bg-accent/20 shadow-sm">
          <div className="flex items-center px-4 py-2 border-b border-accent/10">
            {/* VE indicator with tooltip */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center mr-3 cursor-help">
                    <Zap className="h-4 w-4 text-amber-400 mr-1" />
                    <span className="text-sm text-foreground/70">6 VE</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>
                    Vibe Energy: Used for image generation. Replenishes daily.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <div className="mx-2 h-4 border-r border-accent/20" />

            {/* Model selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-2 text-sm text-foreground/70 rounded-full hover:bg-accent/40"
                >
                  <BrainCircuit className="h-3.5 w-3.5" />
                  <span className="max-w-[160px] truncate">
                    {currentModel?.label || 'Select model'}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[300px]">
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
                      <div className="flex flex-col items-start">
                        <div className="font-medium">{model.label}</div>
                        <div className="text-xs text-muted-foreground w-full truncate">
                          {model.value}
                        </div>
                      </div>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="mx-2 h-4 border-r border-accent/20" />

            {/* Size/Aspect Ratio selector with improved design */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-2 text-sm text-foreground/70 rounded-full hover:bg-accent/40"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span>
                    {isUsingAspectRatio
                      ? selectedSize.replace('x', ':')
                      : selectedSize}
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
                    >
                      {option.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
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
              variant={isSubmitting ? 'outline' : 'default'}
              size="lg"
              className={cn(
                'rounded-full px-5 transition-all duration-300',
                isSubmitting ? 'w-36' : 'w-auto',
              )}
              disabled={!inputValue.trim() || isSubmitting || !currentModel}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Generating
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <SendHorizontal className="h-4 w-4" />
                  Generate
                </span>
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
