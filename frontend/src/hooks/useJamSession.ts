'use client'

import type { ApiError } from '@/lib/api/apiClient'
import { API_BASE_URL } from '@/lib/api/apiClient' // Import base URL for SSE
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
import { useRouter } from 'next/navigation' // Import useRouter
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

// TODO: Refine types as needed
export interface UseJamSessionReturn {
  messages: Message[]
  isGenerating: boolean
  generationProgress: number | null // Example: 0-100 or null
  generatedImages: MessageImage[]
  submitPrompt: (payload: GenerateImagePayload) => void
  isLoadingMessages: boolean
  messagesError: Error | null
  resolvedJamId: string | null // Add resolvedJamId to the return type
  isInitializing: boolean // To indicate if the jam session is being created/loaded initially
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

  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([])
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null)
  const [isGeneratingTask, setIsGeneratingTask] = useState<boolean>(false)
  const [generationProgress, setGenerationProgress] = useState<number | null>(
    null,
  )
  const [generatedImages, setGeneratedImages] = useState<MessageImage[]>([])
  const lastTempUserMessageIdRef = useRef<string | number | null>(null)

  const { mutate: createJamMutation, isPending: isCreatingJam } = useMutation<
    CreateJamResponse,
    ApiError
  >({
    mutationFn: createJam,
    onSuccess: (data) => {
      const newJamIdStr = String(data.jamId)
      setResolvedJamId(newJamIdStr)
      toast.success('New Jam session started!')
      // Replace URL to reflect the new Jam ID, keeping query params (e.g., for remixSourcePostId)
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
      // Handle error, maybe redirect to an error page or allow retry
      router.push('/') // Example: redirect to home on failure
      setIsInitializing(false)
    },
  })

  useEffect(() => {
    if (
      initialJamIdParam === 'new' &&
      !resolvedJamId &&
      !isCreatingJam &&
      isInitializing
    ) {
      console.log('useJamSession: Creating new Jam session...')
      createJamMutation()
    } else if (initialJamIdParam !== 'new') {
      setIsInitializing(false) // If not new, initialization is effectively done
    }
  }, [
    initialJamIdParam,
    resolvedJamId,
    createJamMutation,
    isCreatingJam,
    isInitializing,
  ])

  // Fetch initial messages - only enable if resolvedJamId is set
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
    enabled: !!resolvedJamId && !isInitializing, // Only run if resolvedJamId is set and not still initializing
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const isLoadingMessages = isLoadingInitialMessages || isInitializing

  // Combine fetched and optimistic messages
  const messages = useMemo(() => {
    return [...(fetchedMessages || []), ...optimisticMessages]
  }, [fetchedMessages, optimisticMessages])

  // --- SSE Handling --- //
  useEffect(() => {
    if (!currentTaskId || !resolvedJamId) {
      // Check resolvedJamId
      setIsGeneratingTask(false)
      setGenerationProgress(null)
      return
    }

    setIsGeneratingTask(true)
    setGenerationProgress(0) // Start progress
    let eventSource: EventSource | null = null

    try {
      const eventSourceUrl = `${API_BASE_URL}/tasks/${currentTaskId}/events`
      console.log(`Connecting to SSE: ${eventSourceUrl}`)
      eventSource = new EventSource(eventSourceUrl, { withCredentials: true })

      eventSource.onopen = () =>
        console.log(`SSE opened for task ${currentTaskId}`)
      eventSource.onerror = (error) => {
        console.error('SSE error:', error)
        toast.error('Connection error during generation.')
        setIsGeneratingTask(false)
        setGenerationProgress(null)
        setCurrentTaskId(null) // Reset on error
        eventSource?.close()
      }

      eventSource.addEventListener('progress', (event) => {
        try {
          const data = JSON.parse(event.data)
          console.log('SSE progress:', data)
          setGenerationProgress(data.progress ?? null) // Assuming progress is sent
          // Update optimistic message if needed
          // eslint-disable-next-line react-hooks/exhaustive-deps
          const tempAiId = `temp-ai-${lastTempUserMessageIdRef.current}`
          setOptimisticMessages((prev) =>
            prev.map((msg) =>
              msg.id === tempAiId
                ? { ...msg, text: data.message || msg.text }
                : msg,
            ),
          )
        } catch (e) {
          console.error('Failed to parse progress:', e)
        }
      })

      eventSource.addEventListener('complete', (event) => {
        try {
          const data = JSON.parse(event.data)
          console.log('SSE complete:', data)
          toast.success(data.message || 'Generation complete!')

          // Create final AI message and add generated image
          const numericJamId = Number(resolvedJamId)
          const finalAiMessage: Message = {
            id: data.imageId || `final-ai-${Date.now()}`,
            jam_id: numericJamId,
            role: 'ai',
            text: data.message || 'Generated image:',
            created_at: new Date().toISOString(),
            images: data.imageUrl
              ? [{ id: data.imageId || 0, url: data.imageUrl }]
              : null,
          }
          const newImage = finalAiMessage.images?.[0]

          // Remove optimistic messages and add final one
          // eslint-disable-next-line react-hooks/exhaustive-deps
          const tempAiId = `temp-ai-${lastTempUserMessageIdRef.current}`
          setOptimisticMessages((prev) => [
            // eslint-disable-next-line react-hooks/exhaustive-deps
            ...prev.filter(
              (msg) =>
                msg.id !== lastTempUserMessageIdRef.current &&
                msg.id !== tempAiId,
            ),
            finalAiMessage,
          ])

          if (newImage) {
            setGeneratedImages((prev) => [...prev, newImage])
          }

          setIsGeneratingTask(false)
          setGenerationProgress(100) // Mark as complete
          setCurrentTaskId(null) // Reset task ID
          eventSource?.close()
        } catch (e) {
          console.error('Failed to parse complete:', e)
          setIsGeneratingTask(false)
          setGenerationProgress(null)
          setCurrentTaskId(null)
          eventSource?.close()
        }
      })

      eventSource.addEventListener('error', (event) => {
        // Handle backend error events
        // The generic 'error' event on EventSource typically signals a connection failure
        // and does not carry a data payload like MessageEvent.
        console.error('SSE connection error event:', event)
        toast.error('Generation failed due to a connection or server error.')

        setIsGeneratingTask(false)
        setGenerationProgress(null)
        setCurrentTaskId(null)
        eventSource?.close()
        // eslint-disable-next-line react-hooks/exhaustive-deps
        const tempAiId = `temp-ai-${lastTempUserMessageIdRef.current}`
        // eslint-disable-next-line react-hooks/exhaustive-deps
        setOptimisticMessages((prev) =>
          prev.filter(
            (msg) =>
              msg.id !== lastTempUserMessageIdRef.current &&
              msg.id !== tempAiId,
          ),
        )
      })
    } catch (error) {
      console.error('Failed to create EventSource:', error)
      toast.error('Failed to connect for generation updates.')
      setIsGeneratingTask(false)
      setGenerationProgress(null)
      setCurrentTaskId(null)
    }

    // Cleanup function
    return () => {
      console.log(`Closing SSE connection for task: ${currentTaskId}`)
      eventSource?.close()
      // Reset generating state if component unmounts mid-generation?
      // setIsGeneratingTask(false);
      // setGenerationProgress(null);
    }
  }, [currentTaskId, resolvedJamId]) // Rerun effect if taskId changes

  // --- Mutation for submitting prompt --- //
  const { mutate: submitPromptMutation } = useMutation<
    GenerateImageResponse,
    ApiError,
    GenerateImagePayload
  >({
    mutationFn: (payload) => {
      if (!resolvedJamId)
        throw new Error('Jam ID not resolved for submitting prompt')
      return generateImageForJam(resolvedJamId, payload)
    },
    onSuccess: (data) => {
      setCurrentTaskId(data.taskId)
    },
    onError: (error) => {
      let errorMessage = error.message || 'An unknown error occurred.'
      if (
        error.responseBody?.code === 402 &&
        error.responseBody.currentVE !== undefined
      ) {
        errorMessage = `Insufficient VE (Need ${error.responseBody.requiredVE}, Have ${error.responseBody.currentVE}).`
      }
      toast.error(`Generation request failed: ${errorMessage}`)
      const tempAiId = `temp-ai-${lastTempUserMessageIdRef.current}`
      setOptimisticMessages((prev) =>
        prev.filter(
          (msg) =>
            msg.id !== lastTempUserMessageIdRef.current && msg.id !== tempAiId,
        ),
      )
    },
  })

  // Callback for components to submit a prompt
  const submitPrompt = useCallback(
    (payload: GenerateImagePayload) => {
      if (!resolvedJamId || isInitializing) {
        toast.error('Cannot send message: Jam session not fully initialized.')
        return
      }
      const tempUserId = `temp-user-${Date.now()}`
      // Assigning to .current inside useCallback doesn't require the ref in deps
      lastTempUserMessageIdRef.current = tempUserId

      const userMessage: Message = {
        id: tempUserId,
        jam_id: Number.parseInt(resolvedJamId, 10),
        role: 'user',
        text: payload.prompt,
        created_at: new Date().toISOString(),
        images: null,
      }
      const tempAiId = `temp-ai-${tempUserId}`
      const aiProcessingMessage: Message = {
        id: tempAiId,
        jam_id: Number.parseInt(resolvedJamId, 10),
        role: 'ai',
        text: 'Requesting generation...',
        created_at: new Date().toISOString(),
        images: null,
      }

      // Add optimistic messages immediately
      setOptimisticMessages((prev) => [
        ...prev,
        userMessage,
        aiProcessingMessage,
      ])
      // Reset previous generated images for a new prompt
      setGeneratedImages([])

      // Call the mutation
      submitPromptMutation(payload)
    },
    [resolvedJamId, submitPromptMutation, isInitializing],
  )

  return {
    messages,
    isGenerating: isGeneratingTask, // Use the SSE-tracked state
    generationProgress,
    generatedImages,
    submitPrompt,
    isLoadingMessages,
    messagesError,
    resolvedJamId,
    isInitializing: isInitializing || isCreatingJam,
  }
}
