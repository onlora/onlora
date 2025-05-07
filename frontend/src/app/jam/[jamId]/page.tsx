'use client' // Need client component for state and hooks

import { ActionBar } from '@/components/jam/ActionBar'
import { ChatInput } from '@/components/jam/ChatInput' // Import the real component
import { ImageStrip } from '@/components/jam/ImageStrip' // Import the real component
import { type ImageSize, JamToolbar } from '@/components/jam/JamToolbar' // Import Toolbar and ImageSize type
import { MessageList } from '@/components/jam/MessageList' // Import the real component
import { PublishSheet } from '@/components/jam/PublishSheet'
import type { PostVisibility } from '@/components/jam/PublishSheet' // Import PostVisibility type
import {
  type ApiErrorResponse,
  type GenerateImagePayload,
  type GenerateImageResponse,
  type Message,
  type MessageImage,
  generateImageForJam,
  getJamMessages,
} from '@/lib/api/jamApi' // Import the API function
import { type CreatePostPayload, createPost } from '@/lib/api/postApi' // Import createPost
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query' // Import useMutation, useQueryClient
import { useEffect, useMemo, useRef, useState } from 'react' // Import useMemo and useRef
import { toast } from 'sonner' // Import toast for notifications

// Placeholder components (to be created later)
// const ChatInput = () => <div className="p-4 border-t">Chat Input Placeholder</div>;

interface JamPageProps {
  params: {
    jamId: string
  }
}

// Using default export for Next.js pages
export default function JamPage({ params }: JamPageProps) {
  const { jamId } = params
  const queryClient = useQueryClient() // Get query client instance
  // State for messages added optimistically by the user
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([])
  // State to hold the current task ID for SSE connection
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null)
  // State for generated images displayed in the strip
  const [generatedImages, setGeneratedImages] = useState<MessageImage[]>([])
  // State for selected image IDs
  const [selectedImageIds, setSelectedImageIds] = useState<Set<number>>(
    new Set(),
  )
  // State for selected image size
  const [selectedSize, setSelectedSize] = useState<ImageSize>('512x512') // Default size
  const [isPublishSheetOpen, setIsPublishSheetOpen] = useState(false)

  // Fetch messages using React Query
  const {
    data: fetchedMessages,
    isLoading: isLoadingMessages,
    error: messagesError,
  } = useQuery<Message[], Error>({
    // Query key identifies this query uniquely
    queryKey: ['jamMessages', jamId],
    // The function that fetches the data
    queryFn: () => getJamMessages(jamId),
    // Only run the query if jamId is available
    enabled: !!jamId,
    // Optional: Configure staleTime, refetchOnWindowFocus, etc.
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false, // Don't refetch just on window focus
  })

  // Combine fetched messages with optimistically added ones for display
  const displayMessages = useMemo(() => {
    const baseMessages = fetchedMessages || []
    // Simple append strategy for now. More complex logic could filter
    // based on IDs if optimistic messages get real IDs later.
    return [...baseMessages, ...optimisticMessages]
  }, [fetchedMessages, optimisticMessages])

  // TODO: Display a user-friendly error if messagesError exists
  useEffect(() => {
    if (messagesError) {
      console.error('Error fetching messages:', messagesError.message)
      toast.error(`Failed to load messages: ${messagesError.message}`)
    }
  }, [messagesError])

  // --- Generate Image Mutation --- //
  const { mutate: sendGenerationRequest, isPending: isGenerating } =
    useMutation<GenerateImageResponse, Error, GenerateImagePayload>({
      mutationFn: (payload) => generateImageForJam(jamId, payload),
      onSuccess: (data) => {
        console.log('Generation request successful, taskId:', data.taskId)
        toast.success('Generation started!')
        // Update the temporary "Generating..." message with a real task ID marker?
        // Or just set the task ID to trigger SSE
        setCurrentTaskId(data.taskId) // Trigger SSE connection

        // Optionally update the AI message placeholder to indicate waiting for SSE
        const tempAiId = `temp-ai-${lastTempUserMessageIdRef.current}`
        setOptimisticMessages((prev) =>
          prev.map((msg) =>
            msg.id === tempAiId
              ? {
                  ...msg,
                  text: `Generating... (Task: ${data.taskId.substring(0, 6)}...)`,
                }
              : msg,
          ),
        )
      },
      onError: (error) => {
        console.error('Error sending generation request:', error)
        const apiError = error as Error & Partial<ApiErrorResponse>
        let errorMessage = apiError.message || 'An unknown error occurred.'

        // Customize error message for specific codes (e.g., insufficient VE)
        if (
          apiError.code === 402 &&
          apiError.currentVE !== undefined &&
          apiError.requiredVE !== undefined
        ) {
          errorMessage = `Insufficient VE (Need ${apiError.requiredVE}, Have ${apiError.currentVE}).`
        }
        toast.error(`Generation failed: ${errorMessage}`)

        // Remove the optimistic user message and the temporary "Generating..." message
        setOptimisticMessages((prev) =>
          prev.filter(
            (msg) =>
              msg.id !== lastTempUserMessageIdRef.current &&
              msg.id !== `temp-ai-${lastTempUserMessageIdRef.current}`,
          ),
        )
        setCurrentTaskId(null) // Clear task ID on error
      },
      // We don't need onSettled to setIsSending(false) as isPending handles it
    })

  // Ref to keep track of the last optimistic user message ID for removal on error/success
  const lastTempUserMessageIdRef = useRef<string | number | null>(null)

  const handleSendMessage = (prompt: string) => {
    console.log('handleSendMessage triggered with prompt:', prompt)
    const tempUserId = `temp-${Date.now()}`
    lastTempUserMessageIdRef.current = tempUserId // Store temp ID

    const userMessage: Message = {
      id: tempUserId,
      jam_id: Number.parseInt(jamId, 10),
      role: 'user',
      text: prompt,
      created_at: new Date().toISOString(),
      images: null,
    }
    setOptimisticMessages((prev) => [...prev, userMessage])

    // Add the temporary "Generating..." message
    const tempAiId = `temp-ai-${tempUserId}`
    const aiProcessingMessage: Message = {
      id: tempAiId,
      jam_id: Number.parseInt(jamId, 10),
      role: 'ai',
      text: 'Requesting generation...',
      created_at: new Date().toISOString(),
      images: null,
    }
    setOptimisticMessages((prev) => [...prev, aiProcessingMessage])

    // Prepare payload using selectedSize
    const payload: GenerateImagePayload = {
      prompt: prompt,
      modelProvider: 'openai', // Hardcoded
      modelId: 'dall-e-3', // Hardcoded
      size: selectedSize, // Use state variable
    }

    sendGenerationRequest(payload)
  }

  // --- SSE Handling --- //
  useEffect(() => {
    if (!currentTaskId) return // No task to listen for

    const eventSourceUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api'}/tasks/${currentTaskId}/events`
    console.log(`Connecting to SSE: ${eventSourceUrl}`)
    const eventSource = new EventSource(eventSourceUrl, {
      withCredentials: true,
    })
    let latestAiMessageId: number | null = null // To store ID of final AI message

    eventSource.onopen = () => {
      console.log(`SSE connection opened for task: ${currentTaskId}`)
      toast.info('Listening for generation progress...')
    }

    eventSource.onerror = (error) => {
      console.error('SSE error:', error)
      toast.error('Connection error during generation.')
      eventSource.close() // Close connection on error
      setCurrentTaskId(null) // Reset task ID
    }

    // Listener for progress updates
    eventSource.addEventListener('progress', (event: MessageEvent) => {
      try {
        const progressData = JSON.parse(event.data)
        console.log('SSE progress:', progressData)
        toast.info(progressData.message || 'Generation progress...')
        // Update a specific message or show progress in ImageStrip?
        // For now, just log and toast.
        // Example: Update the placeholder AI message
        const tempAiId = `temp-ai-${lastTempUserMessageIdRef.current}`
        setOptimisticMessages((prev) =>
          prev.map((msg) =>
            msg.id === tempAiId
              ? { ...msg, text: progressData.message || msg.text }
              : msg,
          ),
        )
      } catch (e) {
        console.error('Failed to parse SSE progress data:', event.data, e)
      }
    })

    // Listener for completion updates
    eventSource.addEventListener('complete', (event: MessageEvent) => {
      try {
        const completionData = JSON.parse(event.data)
        console.log('SSE complete:', completionData)
        toast.success(completionData.message || 'Generation complete!')

        // Add the final AI message with image details
        // Requires mapping completionData fields to Message structure
        const finalAiMessage: Message = {
          id: completionData.imageId || `final-ai-${Date.now()}`, // Use actual image ID if available
          jam_id: Number.parseInt(jamId, 10),
          role: 'ai',
          text: completionData.message || 'Generated image:',
          created_at: new Date().toISOString(),
          images: completionData.imageUrl
            ? [
                {
                  id: completionData.imageId || 0,
                  url: completionData.imageUrl,
                  // r2Key might not be sent via SSE, depends on backend
                },
              ]
            : null,
        }
        latestAiMessageId = finalAiMessage.id as number

        // Update generatedImages state
        // TODO: This assumes SSE sends one image URL in completionData. Adjust if it sends multiple or uses progress events.
        if (completionData.imageUrl && completionData.imageId) {
          const newImage: MessageImage = {
            id: completionData.imageId,
            url: completionData.imageUrl,
            // r2Key: completionData.r2Key, // Add if backend sends it
          }
          // Add to existing images, or replace if needed by design
          setGeneratedImages((prev) => [...prev, newImage])
        }

        // Remove placeholder messages and add the final one
        setOptimisticMessages((prev) => [
          ...prev.filter(
            (msg) =>
              msg.id !== `temp-ai-${lastTempUserMessageIdRef.current}` &&
              msg.id !== lastTempUserMessageIdRef.current, // Optionally keep user prompt
          ),
          finalAiMessage,
        ])

        eventSource.close() // Close connection on completion
        setCurrentTaskId(null) // Reset task ID

        // Invalidate or refetch jam messages query after completion?
        // queryClient.invalidateQueries({ queryKey: ['jamMessages', jamId] });
      } catch (e) {
        console.error('Failed to parse SSE complete data:', event.data, e)
        eventSource.close()
        setCurrentTaskId(null)
      }
    })

    // Listener for error updates from the task itself
    eventSource.addEventListener('error', (event: MessageEvent) => {
      try {
        const errorData = JSON.parse(event.data)
        console.error('SSE task error:', errorData)
        toast.error(errorData.message || 'Generation failed during processing.')

        // Remove placeholder messages
        setOptimisticMessages((prev) =>
          prev.filter(
            (msg) =>
              msg.id !== `temp-ai-${lastTempUserMessageIdRef.current}` &&
              msg.id !== lastTempUserMessageIdRef.current, // Optionally keep user prompt
          ),
        )
      } catch (e) {
        console.error('Failed to parse SSE error data:', event.data, e)
        toast.error('Generation failed. Could not parse error details.')
      }
      eventSource.close() // Close connection on task error
      setCurrentTaskId(null) // Reset task ID
    })

    // Cleanup function to close SSE connection when component unmounts or taskId changes
    return () => {
      console.log(`SSE connection closing for task: ${currentTaskId}`)
      eventSource.close()
    }
  }, [currentTaskId, jamId]) // Dependencies

  // --- Image Selection Handler --- //
  const handleImageSelect = (imageId: number) => {
    setSelectedImageIds((prevSelectedIds) => {
      const newSelectedIds = new Set(prevSelectedIds)
      if (newSelectedIds.has(imageId)) {
        newSelectedIds.delete(imageId)
      } else {
        newSelectedIds.add(imageId)
      }
      return newSelectedIds
    })
  }

  // --- Size Change Handler --- //
  const handleSizeChange = (newSize: ImageSize) => {
    setSelectedSize(newSize)
    toast.info(`Image size set to ${newSize}`)
  }

  // --- Data for PublishSheet --- //
  const imagesToPublish = useMemo(() => {
    return generatedImages.filter((img) => selectedImageIds.has(img.id))
  }, [generatedImages, selectedImageIds])

  // --- PublishSheet Handlers --- //
  const handleOpenPublishSheet = () => {
    if (imagesToPublish.length > 0) {
      setIsPublishSheetOpen(true)
    } else {
      toast.error('Please select at least one image to publish.')
    }
  }

  // --- Publish Post Mutation --- //
  const { mutate: submitPost, isPending: isPublishingPost } = useMutation<
    // Define types for useMutation explicitly
    import('@/lib/api/postApi').CreatePostResponse, // Success response type
    Error, // Error type
    CreatePostPayload // Variables type for the mutation function
  >({
    mutationFn: createPost, // The function that performs the API call
    onSuccess: (responseData, variables) => {
      // variables here is the CreatePostPayload
      toast.success(
        `Post '${variables.title}' published! ID: ${responseData.postId}`,
      )
      setIsPublishSheetOpen(false)
      setSelectedImageIds(new Set())
      // TODO: Invalidate relevant queries (e.g., user's posts, feed)
      // queryClient.invalidateQueries({ queryKey: ['userPosts'] });
      // TODO: Optionally redirect to the new post or a gallery page
      // router.push(`/posts/${responseData.postId}`);
    },
    onError: (
      error: Error & Partial<import('@/lib/api/jamApi').ApiErrorResponse>,
    ) => {
      console.error('Error publishing post:', error)
      toast.error(`Failed to publish post: ${error.message || 'Unknown error'}`)
      // Optionally, do not close the sheet on error to allow retries/corrections
      // setIsPublishSheetOpen(false);
    },
  })

  const handlePublishSubmit = (data: {
    title: string
    description: string
    tags: string[]
    visibility: PostVisibility
  }) => {
    if (imagesToPublish.length === 0) {
      toast.error('No images selected for publishing.')
      return
    }

    const payload: CreatePostPayload = {
      title: data.title,
      description: data.description,
      tags: data.tags,
      visibility: data.visibility,
      imageIds: imagesToPublish.map((img) => img.id),
      jamId: Number.parseInt(jamId, 10), // Assuming jamId should be included
    }

    console.log('Submitting post with payload:', payload)
    submitPost(payload) // Call the mutation
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <JamToolbar selectedSize={selectedSize} onSizeChange={handleSizeChange} />
      <div className="flex flex-1 overflow-hidden relative">
        {/* Main Chat Area */}
        <div className="flex flex-col flex-1">
          {/* TODO: Add loading indicator based on isLoadingMessages */}
          <MessageList messages={displayMessages} />
          <ChatInput onSubmit={handleSendMessage} isLoading={isGenerating} />
        </div>
        {/* Sidebar/Details Area (Optional - might be needed later) */}
        {/* <div className="w-1/4 border-l p-4">Sidebar Placeholder</div> */}
        <ActionBar
          selectedCount={selectedImageIds.size}
          onPublish={handleOpenPublishSheet}
          // onSave can be omitted if not implemented, or provide a placeholder
          // onSave={() => toast.info('Save feature coming soon!')}
        />
      </div>
      {/* Render the real ImageStrip with state */}
      <ImageStrip
        images={generatedImages}
        selectedImageIds={selectedImageIds}
        onImageSelect={handleImageSelect}
      />
      <div className="p-2 text-xs text-muted-foreground bg-secondary">
        Jam ID: {jamId} {isLoadingMessages ? '(Loading messages...)' : ''}
        {messagesError ? ` (Error: ${messagesError.message})` : ''}
      </div>
      <PublishSheet
        isOpen={isPublishSheetOpen}
        onOpenChange={setIsPublishSheetOpen}
        selectedImages={imagesToPublish}
        onPublish={handlePublishSubmit}
        isSubmitting={isPublishingPost}
      />
    </div>
  )
}
