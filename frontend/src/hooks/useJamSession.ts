'use client'

import type { ApiError } from '@/lib/api/apiClient'
import {
  createJamSession,
  generateImage,
  getJamMessages,
} from '@/lib/api/jamApi'
import type {
  GenerateImageParams,
  GenerationResponse,
  Message,
  MessageImage,
} from '@/types/images'
import type { ModelProvider } from '@/types/models'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

// Extend Message type for optimistic loading state
interface OptimisticMessage extends Message {
  isLoading?: boolean
}

export interface SubmitPromptParams {
  prompt: string
  modelProvider: ModelProvider
  modelId: string
  size?: string
  aspectRatio?: string
  isMultiModalLanguageModel?: boolean
}

export interface UseJamSessionReturn {
  messages: Message[]
  isGenerating: boolean
  generatedImages: MessageImage[]
  submitPrompt: (params: SubmitPromptParams) => void
  isLoadingMessages: boolean
  messagesError: Error | null
  resolvedJamId: string | null
  isInitializing: boolean
}

export function useJamSession(
  initialJamId?: string | null,
): UseJamSessionReturn {
  const queryClient = useQueryClient()
  const router = useRouter()
  const [resolvedJamId, setResolvedJamId] = useState<string | null>(
    initialJamId === 'new' ? null : initialJamId || null,
  )
  const [isInitializing, setIsInitializing] = useState<boolean>(
    initialJamId === 'new',
  )

  const [optimisticMessages, setOptimisticMessages] = useState<
    OptimisticMessage[]
  >([])
  const [generatedImages, setGeneratedImages] = useState<MessageImage[]>([])
  const lastTempIdRef = useRef<string | null>(null)
  const hasOptimisticUpdatesRef = useRef<boolean>(false)

  // Create new jam session
  const { mutate: createJamMutation, isPending: isCreatingJam } = useMutation<
    { jamId: string },
    ApiError
  >({
    mutationFn: createJamSession,
    onSuccess: (data) => {
      setResolvedJamId(data.jamId)
      toast.success('New Jam session started!')

      // Update URL
      const currentPath = window.location.pathname.substring(
        0,
        window.location.pathname.lastIndexOf('/'),
      )
      const newUrl = `${currentPath}/${data.jamId}${window.location.search}`
      router.replace(newUrl)
      setIsInitializing(false)
    },
    onError: (error) => {
      toast.error(`Failed to create Jam session: ${error.message}`)
      router.push('/')
      setIsInitializing(false)
    },
  })

  // Initialize new jam if needed
  useEffect(() => {
    if (
      initialJamId === 'new' &&
      !resolvedJamId &&
      !isCreatingJam &&
      isInitializing
    ) {
      createJamMutation()
    } else if (initialJamId !== 'new') {
      setIsInitializing(false)
    }
  }, [
    initialJamId,
    resolvedJamId,
    createJamMutation,
    isCreatingJam,
    isInitializing,
  ])

  // Fetch messages
  const {
    data: fetchedMessages,
    isLoading: isLoadingInitialMessages,
    error: messagesError,
  } = useQuery<Message[], Error>({
    queryKey: ['jamMessages', resolvedJamId],
    queryFn: () => {
      if (!resolvedJamId) throw new Error('Jam ID not resolved')
      return getJamMessages(resolvedJamId)
    },
    enabled: !!resolvedJamId && !isInitializing,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  })

  const isLoadingMessages = isLoadingInitialMessages || isInitializing

  // Merge fetched and optimistic messages
  const messages = useMemo(() => {
    // Clean up optimistic updates when server data arrives
    if (
      fetchedMessages &&
      fetchedMessages.length > 0 &&
      hasOptimisticUpdatesRef.current
    ) {
      // Find the last AI message from server - likely our generated response
      const lastServerAiMessage = [...fetchedMessages]
        .reverse()
        .find((msg) => msg.role === 'ai')

      if (lastServerAiMessage) {
        // Remove corresponding optimistic messages
        setOptimisticMessages((prev) =>
          prev.filter(
            (msg) =>
              msg.id !== lastTempIdRef.current &&
              msg.id !== `temp-ai-${lastTempIdRef.current}`,
          ),
        )

        // Reset flag
        hasOptimisticUpdatesRef.current = false
      }
    }

    // Filter out loading messages when we have server data
    const finalOptimistic = fetchedMessages
      ? optimisticMessages.filter((msg) => !msg.isLoading)
      : optimisticMessages

    return [...(fetchedMessages || []), ...finalOptimistic] as Message[]
  }, [fetchedMessages, optimisticMessages])

  // Generate image mutation
  const { mutate: generateImageMutation, isPending: isGeneratingImage } =
    useMutation<GenerationResponse, ApiError, GenerateImageParams>({
      mutationFn: (params) => {
        if (!resolvedJamId) {
          toast.error('Jam session is not active.')
          throw new Error('Jam session not resolved for image generation.')
        }
        return generateImage(resolvedJamId, params)
      },
      onSuccess: (data) => {
        // Create message from response
        const newAiMessage: Message = {
          id: data.id,
          role: 'ai',
          text: data.text,
          images: data.images,
          createdAt: data.createdAt,
        }

        // Update cache directly instead of refetching
        queryClient.setQueryData(
          ['jamMessages', resolvedJamId],
          (oldData: Message[] | undefined) => {
            if (!oldData) return [newAiMessage]

            // Check if message already exists in cache
            const messageExists = oldData.some(
              (msg) => msg.id === newAiMessage.id,
            )
            if (messageExists) return oldData

            // Add new message to cache
            return [...oldData, newAiMessage]
          },
        )

        // Clean up optimistic messages
        setOptimisticMessages((prev) => {
          return prev.filter(
            (msg) =>
              msg.id !== lastTempIdRef.current &&
              msg.id !== `temp-ai-${lastTempIdRef.current}`,
          )
        })

        // Add new images to collection
        if (newAiMessage.images && newAiMessage.images.length > 0) {
          setGeneratedImages((prev) => [
            ...prev,
            ...(newAiMessage.images || []),
          ])
        }
      },
      onError: (error) => {
        toast.error(`Image generation failed: ${error.message}`)
        setOptimisticMessages((prev) =>
          prev.filter(
            (msg) =>
              msg.id !== lastTempIdRef.current &&
              msg.id !== `temp-ai-${lastTempIdRef.current}`,
          ),
        )
      },
    })

  // Submit prompt with optimistic updates
  const submitPrompt = useCallback(
    (params: SubmitPromptParams) => {
      if (!resolvedJamId) {
        toast.error('Jam session is not active.')
        return
      }
      if (isGeneratingImage) {
        toast.info('Already generating an image, please wait.')
        return
      }

      // Create unique ID for this message pair
      const tempUserMessageId = `temp-user-${Date.now()}`
      lastTempIdRef.current = tempUserMessageId

      // Create optimistic user message
      const userMessage: Message = {
        id: tempUserMessageId,
        role: 'user',
        text: params.prompt,
        createdAt: new Date().toISOString(),
      }

      // Update cache with user message
      queryClient.setQueryData(
        ['jamMessages', resolvedJamId],
        (oldData: Message[] | undefined) => {
          if (!oldData) return [userMessage]
          return [...oldData, userMessage]
        },
      )

      // Create optimistic AI response placeholder
      const tempAiMessageId = `temp-ai-${tempUserMessageId}`
      const aiPlaceholderMessage: OptimisticMessage = {
        id: tempAiMessageId,
        role: 'ai',
        text: 'Generating image...',
        createdAt: new Date().toISOString(),
        isLoading: true,
      }

      // Add placeholder to optimistic messages
      setOptimisticMessages((prevMessages) => [
        ...prevMessages,
        aiPlaceholderMessage,
      ])

      // Mark that we've applied optimistic updates
      hasOptimisticUpdatesRef.current = true

      // Build params for the API
      const imageParams: GenerateImageParams = {
        prompt: params.prompt,
        modelProvider: params.modelProvider,
        modelId: params.modelId,
        isMultiModalLanguageModel: params.isMultiModalLanguageModel,
      }

      // Add size or aspect ratio
      if (params.size) {
        imageParams.size = params.size
      } else if (params.aspectRatio) {
        imageParams.aspectRatio = params.aspectRatio
      }

      // Add conversation context for multi-modal models
      if (params.isMultiModalLanguageModel && fetchedMessages) {
        // Convert recent messages to the format expected by the API
        const recentMessages = fetchedMessages
          .slice(-5) // Get last 5 messages for context
          .map((msg) => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.text || '',
          }))

        if (recentMessages.length > 0) {
          imageParams.messages = recentMessages
        }
      }

      // Trigger generation
      generateImageMutation(imageParams)
    },
    [
      resolvedJamId,
      generateImageMutation,
      isGeneratingImage,
      queryClient,
      fetchedMessages,
    ],
  )

  return {
    messages,
    isGenerating: isGeneratingImage,
    generatedImages,
    submitPrompt,
    isLoadingMessages,
    messagesError,
    resolvedJamId,
    isInitializing,
  }
}
