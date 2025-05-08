'use client' // Need client component for state and hooks

import ProtectedPage from '@/components/auth/ProtectedPage' // Import the wrapper
import { ActionBar } from '@/components/jam/ActionBar'
import { ChatInput } from '@/components/jam/ChatInput' // Import the real component
import { ImageLightbox } from '@/components/jam/ImageLightbox' // Import ImageLightbox
import { ImageStrip } from '@/components/jam/ImageStrip' // Import the real component
import { type ImageSize, JamToolbar } from '@/components/jam/JamToolbar' // Import Toolbar and ImageSize type
import { MessageList } from '@/components/jam/MessageList' // Import the real component
import { PublishSheet } from '@/components/jam/PublishSheet'
import { Button } from '@/components/ui/button'
import { useJamSession } from '@/hooks/useJamSession' // Import useJamSession
import type { ApiError } from '@/lib/api/apiClient' // Correct import for ApiError
import type { GenerateImagePayload, MessageImage } from '@/lib/api/jamApi' // Import the API function
// import type { ApiErrorResponse } from '@/lib/api/apiClient' // No longer needed here if mutation is removed
import {
  type CreatePostPayload,
  type PostCloneInfo, // Import PostCloneInfo type
  createPost,
  getPostCloneInfo, // Import getPostCloneInfo
} from '@/lib/api/postApi' // Import createPost
import { useMutation, useQueryClient } from '@tanstack/react-query' // useQuery no longer needed here
import { AlertTriangle, Loader2 } from 'lucide-react' // Import icons
import { useRouter, useSearchParams } from 'next/navigation' // Import useRouter and useSearchParams
import { useEffect, useMemo, useState } from 'react' // Import useMemo and useRef
import { toast } from 'sonner' // Import toast for notifications

const CHAT_HISTORY_LENGTH = 15 // Display last 15 messages

interface JamPageProps {
  params: {
    jamId: string
  }
}

export default function JamPage({ params }: JamPageProps) {
  const { jamId: jamIdFromParams } = params
  const queryClient = useQueryClient() // Get query client instance
  const router = useRouter()
  const searchParams = useSearchParams() // Get searchParams

  // State for pre-filled data from a remixed post
  const [initialPublishData, setInitialPublishData] =
    useState<PostCloneInfo | null>(null)

  // Selected image IDs for publishing
  const [selectedImageIds, setSelectedImageIds] = useState<Set<number>>(
    new Set(),
  )
  // Selected image size for generation
  const [selectedSize, setSelectedSize] = useState<ImageSize>('1024x1024')
  const [isPublishSheetOpen, setIsPublishSheetOpen] = useState(false)

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxImage, setLightboxImage] = useState<MessageImage | null>(null)

  // Use useJamSession for all jam-related state and logic
  const {
    messages: allMessages, // All messages from the hook
    isGenerating,
    generationProgress,
    generatedImages: jamGeneratedImages, // Use this for ImageStrip and PublishSheet logic
    submitPrompt,
    isLoadingMessages,
    messagesError,
    resolvedJamId, // Destructure resolvedJamId
    isInitializing, // Destructure isInitializing
  } = useJamSession(jamIdFromParams)

  // Effect to fetch clone info if remixSourcePostId is present on a new jam session
  useEffect(() => {
    const remixSourcePostId = searchParams.get('remixSourcePostId')

    if (
      remixSourcePostId &&
      jamIdFromParams === 'new' &&
      !initialPublishData &&
      !isInitializing
    ) {
      // Condition based on jamId from params being 'new'
      const fetchCloneData = async () => {
        try {
          // Do not show toast.info here as useJamSession will show 'New Jam session started!'
          const data = await getPostCloneInfo(remixSourcePostId)
          setInitialPublishData(data)
          // Optionally pre-fill parts of the prompt or trigger a first message based on this data?
          // For now, just storing for PublishSheet.
          if (data) toast.success('Original vibe data loaded for remixing.')
        } catch (error) {
          console.error('Failed to fetch clone info for remix:', error)
          toast.error(
            `Could not load data from original vibe: ${
              (error as Error).message
            }`,
          )
          // Potentially redirect or clear remixSourcePostId if fetching fails critically
          // router.replace(`/jam/${jamIdFromParams}`, undefined); // Clear query param example
        }
      }
      fetchCloneData()
    }
  }, [jamIdFromParams, searchParams, initialPublishData, isInitializing])

  // Display only the last N messages
  const displayMessages = useMemo(() => {
    return allMessages.slice(-CHAT_HISTORY_LENGTH)
  }, [allMessages])

  // Display a user-friendly error if messagesError (from hook) exists
  useEffect(() => {
    if (messagesError) {
      console.error('Error fetching messages:', messagesError.message)
      toast.error(`Failed to load messages: ${messagesError.message}`)
    }
  }, [messagesError])

  // Ref for last optimistic message ID (potentially remove if hook handles all optimistic UI)
  // const lastTempUserMessageIdRef = useRef<string | number | null>(null) // useJamSession handles this

  const handleSubmitPrompt = (promptText: string) => {
    if (!resolvedJamId || isInitializing) {
      toast.error('Jam session is not ready yet. Please wait.')
      return
    }
    const payload: GenerateImagePayload = {
      prompt: promptText,
      modelProvider: 'openai', // Hardcoded for now
      modelId: 'dall-e-3', // Hardcoded for now
      size: selectedSize,
    }
    submitPrompt(payload) // submitPrompt is from useJamSession
  }

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

  // --- Lightbox Image Activation Handler ---
  const handleImageActivate = (image: MessageImage) => {
    setLightboxImage(image)
    setLightboxOpen(true)
  }

  // --- Size Change Handler --- //
  const handleSizeChange = (newSize: ImageSize) => {
    setSelectedSize(newSize)
    toast.info(`Image size set to ${newSize}`)
  }

  // --- Data for PublishSheet --- //
  const imagesToPublish = useMemo(() => {
    // Use jamGeneratedImages from the hook
    return jamGeneratedImages.filter((img: MessageImage) =>
      selectedImageIds.has(img.id),
    )
  }, [jamGeneratedImages, selectedImageIds])

  // --- PublishSheet Handlers --- //
  const handleOpenPublishSheet = () => {
    if (imagesToPublish.length > 0) {
      setIsPublishSheetOpen(true)
    } else {
      toast.error('Please select at least one image to publish.')
    }
  }

  // --- Publish Post Mutation --- //
  const { mutate: publishPost, isPending: isPublishingPost } = useMutation<
    { postId: number },
    ApiError,
    Omit<CreatePostPayload, 'imageIds' | 'jamId'>
  >({
    mutationFn: async (formData) => {
      if (!resolvedJamId) {
        toast.error('Jam session ID not available. Cannot publish.')
        throw new Error('Jam ID not resolved for publishing')
      }
      const payload: CreatePostPayload = {
        ...formData,
        imageIds: Array.from(selectedImageIds),
        jamId: Number.parseInt(resolvedJamId, 10), // Use resolvedJamId
      }
      // Add remix fields if initialPublishData exists (from a remix operation)
      if (initialPublishData) {
        payload.parentPostId = initialPublishData.parentPostId
        payload.rootPostId = initialPublishData.rootPostId
        payload.generation = initialPublishData.generation
      }

      // imagesToPublish is already derived from jamGeneratedImages
      if (imagesToPublish.length === 0 && payload.imageIds.length > 0) {
        console.warn(
          'Selected image IDs not found in current generatedImages state during publish.',
        )
      }
      return createPost(payload)
    },
    onSuccess: (data) => {
      toast.success(`Vibe published successfully! Post ID: ${data.postId}`)
      setIsPublishSheetOpen(false)
      setSelectedImageIds(new Set()) // Clear selection
      queryClient.invalidateQueries({ queryKey: ['feed', 'latest'] })
      if (resolvedJamId) {
        queryClient.invalidateQueries({
          queryKey: ['jamMessages', resolvedJamId],
        }) // Invalidate jam messages
      }
      router.push(`/posts/${data.postId}`) // Redirect to post detail page
    },
    onError: (error) => {
      console.error('Error publishing post:', error)
      toast.error(`Failed to publish: ${error.message}`)
    },
  })

  if (isInitializing && !resolvedJamId) {
    return (
      <ProtectedPage>
        <div className="flex items-center justify-center h-screen">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="ml-3 text-xl text-muted-foreground">
            Starting your Jam session...
          </p>
        </div>
      </ProtectedPage>
    )
  }

  if (!isInitializing && !resolvedJamId) {
    return (
      <ProtectedPage>
        <div className="flex flex-col items-center justify-center h-screen">
          <AlertTriangle className="h-16 w-16 text-destructive mb-6" />
          <h2 className="text-2xl font-semibold mb-3">Jam Session Error</h2>
          <p className="text-lg text-muted-foreground mb-6 text-center max-w-md">
            We couldn't start or load your Jam session. Please try returning to
            the homepage and starting a new Jam.
          </p>
          <Button onClick={() => router.push('/')} size="lg">
            Go to Homepage
          </Button>
        </div>
      </ProtectedPage>
    )
  }

  // If resolvedJamId is available (and not initializing)
  return (
    <ProtectedPage>
      <div className="flex h-[calc(100vh-theme(spacing.14)-1px)] flex-col">
        <JamToolbar
          selectedSize={selectedSize}
          onSizeChange={handleSizeChange}
          jamId={resolvedJamId} // Use resolvedJamId here
        />
        <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
          <div className="flex flex-1 flex-col overflow-y-auto p-4 md:border-r">
            {isLoadingMessages && resolvedJamId && (
              <div className="flex justify-center items-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="ml-2 text-muted-foreground">
                  Loading messages...
                </p>
              </div>
            )}
            {!isLoadingMessages && <MessageList messages={displayMessages} />}
          </div>
          <div className="flex flex-col border-t p-4 md:w-72 md:border-l md:border-t-0">
            <ImageStrip
              images={jamGeneratedImages}
              selectedImageIds={selectedImageIds}
              onImageSelect={handleImageSelect}
              onImageActivate={handleImageActivate}
            />
            {selectedImageIds.size > 0 && (
              <ActionBar
                selectedCount={selectedImageIds.size}
                onPublish={handleOpenPublishSheet}
              />
            )}
            {jamGeneratedImages.length === 0 && !isGenerating && (
              <div className="flex flex-col items-center justify-center text-center text-sm text-muted-foreground pt-10">
                <p>Your generated images will appear here.</p>
                {isInitializing && <p>(Initializing session...)</p>}
              </div>
            )}
          </div>
        </div>
        <div className="border-t p-4">
          <ChatInput
            onSubmit={handleSubmitPrompt} // Renamed from handleSendMessage
            isLoading={isGenerating}
          />
        </div>
      </div>
      <PublishSheet
        isOpen={isPublishSheetOpen}
        onOpenChange={setIsPublishSheetOpen}
        selectedImages={imagesToPublish}
        onSubmit={publishPost}
        isSubmitting={isPublishingPost}
        initialTitle={initialPublishData?.title || ''}
        initialTags={initialPublishData?.tags || []}
      />
      {lightboxImage && (
        <ImageLightbox
          isOpen={lightboxOpen}
          onOpenChange={setLightboxOpen}
          imageUrl={lightboxImage.url}
          altText={`Generated image ${lightboxImage.id}`}
        />
      )}
    </ProtectedPage>
  )
}
