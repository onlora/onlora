'use client'

import type { ApiError } from '@/lib/api/apiClient'
import {
  type CreateJamResponse,
  type GenerateImagePayload,
  type GenerateImageResponse,
  type Message,
  type MessageImage,
  createJam,
  generateImageForJam,
  getJamMessages,
} from '@/lib/api/jamApi'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

// Extend Message type for optimistic loading state
interface OptimisticMessage extends Message {
  isLoading?: boolean
}

export interface UseJamSessionReturn {
  messages: Message[] // Will actually be OptimisticMessage[] internally at times
  isGenerating: boolean
  generationProgress: number | null
  generatedImages: MessageImage[]
  submitPrompt: (payload: GenerateImagePayload) => void
  isLoadingMessages: boolean
  messagesError: Error | null
  resolvedJamId: string | null
  isInitializing: boolean
}

export function useJamSession(initialJamIdParam: string): UseJamSessionReturn {
  const queryClient = useQueryClient()
  const router = useRouter()
  const [resolvedJamId, setResolvedJamId] = useState<string | null>(
    initialJamIdParam === 'new' ? null : initialJamIdParam,
  )
  const [isInitializing, setIsInitializing] = useState<boolean>(
    initialJamIdParam === 'new',
  )

  const [optimisticMessages, setOptimisticMessages] = useState<
    OptimisticMessage[]
  >([])
  const [generatedImages, setGeneratedImages] = useState<MessageImage[]>([])
  const lastTempUserMessageIdRef = useRef<string | number | null>(null)

  // Flag to track if we've applied optimistic updates that need to be cleaned up
  const hasAppliedOptimisticUpdate = useRef<boolean>(false)

  const { mutate: createJamMutation, isPending: isCreatingJam } = useMutation<
    CreateJamResponse,
    ApiError
  >({
    mutationFn: createJam,
    onSuccess: (data) => {
      const newJamIdStr = String(data.jamId)
      setResolvedJamId(newJamIdStr)
      toast.success('New Jam session started!')
      const currentPath = window.location.pathname.substring(
        0,
        window.location.pathname.lastIndexOf('/'),
      )
      const newUrl = `${currentPath}/${newJamIdStr}${window.location.search}`
      router.replace(newUrl)
      setIsInitializing(false)
    },
    onError: (error) => {
      toast.error(`Failed to create Jam session: ${error.message}`)
      router.push('/')
      setIsInitializing(false)
    },
  })

  // Initialize new Jam session if needed
  useEffect(() => {
    if (
      initialJamIdParam === 'new' &&
      !resolvedJamId &&
      !isCreatingJam &&
      isInitializing
    ) {
      createJamMutation()
    } else if (initialJamIdParam !== 'new') {
      setIsInitializing(false)
    }
  }, [
    initialJamIdParam,
    resolvedJamId,
    createJamMutation,
    isCreatingJam,
    isInitializing,
  ])

  // Fetch messages query with optimized settings
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
    staleTime: 5 * 60 * 1000, // Keep data fresh for 5 minutes
    refetchOnWindowFocus: false,
    // Prevent excessive refetching
    refetchOnMount: false,
    refetchOnReconnect: false,
  })

  const isLoadingMessages = isLoadingInitialMessages || isInitializing

  // Merge fetched and optimistic messages
  const messages = useMemo(() => {
    // Clean up optimistic updates when server data arrives
    if (
      fetchedMessages &&
      fetchedMessages.length > 0 &&
      hasAppliedOptimisticUpdate.current
    ) {
      // Find the last AI message from server - likely our generated response
      const lastServerAiMessage = [...fetchedMessages]
        .reverse()
        .find((msg) => msg.role === 'ai')

      if (lastServerAiMessage) {
        // Remove corresponding optimistic messages but keep other pending updates
        setOptimisticMessages((prev) =>
          prev.filter(
            (msg) =>
              msg.id !== lastTempUserMessageIdRef.current &&
              msg.id !== `temp-ai-${lastTempUserMessageIdRef.current}`,
          ),
        )

        // Reset flag
        hasAppliedOptimisticUpdate.current = false
      }
    }

    // Filter out loading messages when we have server data
    const finalOptimistic = fetchedMessages
      ? optimisticMessages.filter((msg) => !msg.isLoading)
      : optimisticMessages

    return [...(fetchedMessages || []), ...finalOptimistic] as Message[]
  }, [fetchedMessages, optimisticMessages])

  // Generate image mutation with cache management
  const { mutate: generateImageMutation, isPending: isGeneratingImage } =
    useMutation<GenerateImageResponse, ApiError, GenerateImagePayload>({
      mutationFn: (payload) => {
        if (!resolvedJamId) {
          toast.error('Jam session is not active.')
          throw new Error('Jam session not resolved for image generation.')
        }
        return generateImageForJam(resolvedJamId, payload)
      },
      onSuccess: (data) => {
        const newAiMessage: Message = {
          id: data.id,
          jam_id: data.jamId,
          role: 'ai',
          text: data.text,
          images: data.images,
          created_at: data.createdAt,
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
              msg.id !== lastTempUserMessageIdRef.current &&
              msg.id !== `temp-ai-${lastTempUserMessageIdRef.current}`,
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
              msg.id !== lastTempUserMessageIdRef.current &&
              msg.id !== `temp-ai-${lastTempUserMessageIdRef.current}`,
          ),
        )
      },
      onSettled: () => {
        // Mark queries as stale but don't trigger automatic refetch
        if (resolvedJamId) {
          queryClient.invalidateQueries({
            queryKey: ['jamMessages', resolvedJamId],
            refetchType: 'none',
          })
        }
      },
    })

  // Submit prompt with optimistic updates
  const submitPrompt = useCallback(
    (payload: GenerateImagePayload) => {
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
      lastTempUserMessageIdRef.current = tempUserMessageId

      // Create optimistic user message
      const userMessage: Message = {
        id: tempUserMessageId,
        jam_id: Number(resolvedJamId),
        role: 'user',
        text: payload.prompt,
        created_at: new Date().toISOString(),
        images: null,
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
        jam_id: Number(resolvedJamId),
        role: 'ai',
        text: 'Generating image...',
        created_at: new Date().toISOString(),
        images: null,
        isLoading: true,
      }

      // Add placeholder to optimistic messages
      setOptimisticMessages((prevMessages) => [
        ...prevMessages,
        aiPlaceholderMessage,
      ])

      // Mark that we've applied optimistic updates
      hasAppliedOptimisticUpdate.current = true

      // Trigger generation
      generateImageMutation(payload)
    },
    [resolvedJamId, generateImageMutation, isGeneratingImage, queryClient],
  )

  return {
    messages: messages as Message[],
    isGenerating: isGeneratingImage,
    generationProgress: null,
    generatedImages,
    submitPrompt,
    isLoadingMessages,
    messagesError,
    resolvedJamId,
    isInitializing,
  }
}
