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
import { getMyVeBalance } from '@/lib/api/userApi'
import { getActionVeCost } from '@/lib/api/veApi'
import { cn } from '@/lib/utils'
import type { AIModelData, ImageSize } from '@/types/models'
import { useQuery } from '@tanstack/react-query'
import {
  BrainCircuit,
  LayoutGrid,
  Loader2,
  SendHorizontal,
  Wallet,
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
  const [modelVeCosts, setModelVeCosts] = useState<Record<string, string>>({})

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

  // Fetch VE cost for the current model and 'generate' action
  const {
    data: veCostData,
    isLoading: veCostLoading,
    error: veCostErrorDataObj,
    refetch: refetchVeCost, // To refetch when model changes if needed by other logic
  } = useQuery({
    queryKey: ['veCost', 'generate', currentModel?.value],
    queryFn: () => {
      if (!currentModel?.value) {
        // This should ideally not be called if query is disabled correctly,
        // but as a safeguard:
        return Promise.resolve({ cost: -1, error: 'Model not selected' })
      }
      return getActionVeCost('generate', currentModel.value)
    },
    enabled: !!currentModel?.value, // Only run query if a model is selected
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: false, // Don't retry on error for this, to avoid spamming if config is missing
  })

  const veCostApiError =
    veCostErrorDataObj && 'message' in veCostErrorDataObj
      ? (veCostErrorDataObj as ApiError)?.message || veCostErrorDataObj.message
      : null

  let veDisplay = 'Ready!'
  if (veCostLoading) {
    veDisplay = 'Loading...'
  } else if (veCostData?.cost !== undefined && veCostData.cost >= 0) {
    veDisplay = `${veCostData.cost} VE`
  } else if (veCostApiError) {
    veDisplay = 'VE Ready' // More positive error message
    console.error('ChatInput VE Cost Error:', veCostApiError, veCostData?.error)
  } else if (veCostData?.error) {
    // Error message from the API response itself
    veDisplay = 'VE Ready'
    console.error('ChatInput VE Cost API Error:', veCostData.error)
  } else if (!currentModel) {
    veDisplay = 'Select Model' // No model selected
  }

  // 查询用户的VE余额
  const {
    data: veBalanceData,
    isLoading: veBalanceLoading,
    error: veBalanceError,
  } = useQuery({
    queryKey: ['veBalance'],
    queryFn: getMyVeBalance,
    staleTime: 60 * 1000, // 缓存1分钟
  })

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

  useEffect(() => {
    if (modelsLoading || !availableModels || availableModels.length === 0)
      return

    const fetchAllModelCosts = async () => {
      const costsMap: Record<string, string> = {}

      for (const model of availableModels) {
        try {
          const costData = await getActionVeCost('generate', model.value)
          if (costData.cost !== undefined && costData.cost >= 0) {
            costsMap[model.value] = `${costData.cost} VE`
          } else {
            costsMap[model.value] = 'VE'
          }
        } catch (err) {
          console.error(`Error fetching VE cost for ${model.value}:`, err)
          costsMap[model.value] = 'VE'
        }
      }

      setModelVeCosts(costsMap)
    }

    fetchAllModelCosts()
  }, [availableModels, modelsLoading])

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
        <div className="relative w-full rounded-xl bg-accent/20 shadow-sm border border-accent/30">
          <div className="flex items-center px-4 py-2 border-b border-accent/10">
            {/* Model selector with integrated VE indicator */}
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
              <DropdownMenuContent align="start" className="w-[350px] p-2">
                <div className="flex justify-between items-center px-3 py-2 mb-2">
                  <h3 className="text-base font-medium">AI Model</h3>
                  <div className="flex items-center gap-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center px-2 py-1 gap-1.5 bg-gradient-to-r from-emerald-500/10 to-green-500/10 border border-emerald-500/20 rounded-lg cursor-help">
                            <Wallet className="h-3.5 w-3.5 text-emerald-500" />
                            <span className="text-sm">
                              {veBalanceLoading ? (
                                <span className="text-muted-foreground">
                                  Loading...
                                </span>
                              ) : veBalanceError ? (
                                <span className="text-muted-foreground">
                                  Error
                                </span>
                              ) : (
                                <span>
                                  <span className="text-emerald-500/70 text-xs">
                                    Available:
                                  </span>{' '}
                                  <span className="font-medium text-emerald-600">
                                    {veBalanceData?.balance || 0}{' '}
                                    <span className="text-green-500">VE</span>
                                  </span>
                                </span>
                              )}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p>
                            <span className="font-medium">
                              Your Vibe Energy Balance
                            </span>{' '}
                            - This is the amount of VE available to create
                            images. Refreshes every 24 hours.
                            {veBalanceError && (
                              <span className="block text-destructive text-xs mt-1">
                                Unable to load your current balance
                              </span>
                            )}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
                <div className="space-y-1">
                  {availableModels.map((model) => (
                    <button
                      type="button"
                      key={model.value}
                      className={cn(
                        'flex items-center justify-between w-full px-3 py-2.5 rounded-md transition-colors text-left',
                        model.value === currentModel?.value
                          ? 'bg-gradient-to-r from-emerald-500/5 to-green-500/5 border border-emerald-500/15'
                          : 'hover:bg-accent/10 cursor-pointer',
                      )}
                      onClick={() => handleModelChangeInternal(model.value)}
                      disabled={modelsLoading}
                      aria-pressed={model.value === currentModel?.value}
                    >
                      <div className="flex flex-col">
                        <div className="font-medium">{model.label}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[230px]">
                          {model.value}
                        </div>
                      </div>
                      <div
                        className={cn(
                          'flex items-center gap-1 px-2 py-1 rounded-full',
                          model.value === currentModel?.value
                            ? 'bg-gradient-to-r from-emerald-500/10 to-green-500/10 text-emerald-600'
                            : 'bg-muted/40 text-muted-foreground',
                        )}
                      >
                        <Zap
                          className={cn(
                            'h-3.5 w-3.5',
                            model.value === currentModel?.value
                              ? 'text-emerald-500'
                              : '',
                          )}
                        />
                        <span className="text-xs font-medium whitespace-nowrap">
                          {model.value === currentModel?.value ? (
                            typeof veDisplay === 'string' ? (
                              <span>
                                {veDisplay.replace(' VE', '')}{' '}
                                <span className="text-green-500">VE</span>
                              </span>
                            ) : (
                              veDisplay
                            )
                          ) : typeof modelVeCosts[model.value] === 'string' ? (
                            <span>
                              {(modelVeCosts[model.value] || '').replace(
                                ' VE',
                                '',
                              )}{' '}
                              <span className="text-green-500">VE</span>
                            </span>
                          ) : (
                            'VE'
                          )}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
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
