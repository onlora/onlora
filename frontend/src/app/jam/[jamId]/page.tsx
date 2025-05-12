'use client'

import ProtectedPage from '@/components/auth/ProtectedPage'
import { ChatInput } from '@/components/jam/ChatInput'
import { ImagePanel } from '@/components/jam/ImagePanel'
import { MessageList } from '@/components/jam/MessageList'
import { PublishSheet } from '@/components/jam/PublishSheet'
import { Button } from '@/components/ui/button'
import { useJamSession } from '@/hooks/useJamSession'
import type { ApiError } from '@/lib/api/apiClient'
import type { MessageImage } from '@/lib/api/jamApi'
import type { AIModelData as ApiAIModelDataFromApi } from '@/lib/api/modelApi'
import {
  type CreatePostPayload,
  type PostCloneInfo,
  createPost,
  getPostCloneInfo,
} from '@/lib/api/postApi'
import { cn } from '@/lib/utils'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  MessageCircle,
  Paintbrush,
} from 'lucide-react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

type ImageSize = '512x512' | '768x768' | '1024x1024'
const CHAT_HISTORY_LENGTH = 15

export default function JamPage() {
  // Core state and hooks
  const routeParams = useParams()
  const jamIdFromParams = routeParams.jamId as string
  const queryClient = useQueryClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messageContainerRef = useRef<HTMLDivElement>(null)

  // UI state
  const [initialPublishData, setInitialPublishData] =
    useState<PostCloneInfo | null>(null)
  const [selectedImageIds, setSelectedImageIds] = useState<Set<number>>(
    new Set(),
  )
  const [selectedSize, setSelectedSize] = useState<ImageSize>('1024x1024')
  const [isPublishSheetOpen, setIsPublishSheetOpen] = useState(false)
  const [activatedImage, setActivatedImage] = useState<MessageImage | null>(
    null,
  )
  const [selectedModel, setSelectedModel] =
    useState<ApiAIModelDataFromApi | null>(null)
  const [showImagePanel, setShowImagePanel] = useState(false)

  // Jam session hook for messaging and image generation
  const {
    messages: allMessages,
    isGenerating,
    generatedImages: jamGeneratedImages,
    submitPrompt,
    isLoadingMessages,
    messagesError,
    resolvedJamId,
    isInitializing,
  } = useJamSession(jamIdFromParams)

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    if (allMessages.length) {
      // Use setTimeout to ensure this happens after the DOM is updated
      setTimeout(() => {
        if (messageContainerRef.current) {
          messageContainerRef.current.scrollTop =
            messageContainerRef.current.scrollHeight
        }
      }, 100)
    }
  }, [allMessages.length])

  // Fetch remix data if navigated from a post
  useEffect(() => {
    const remixSourcePostId = searchParams.get('remixSourcePostId')
    if (
      remixSourcePostId &&
      jamIdFromParams === 'new' &&
      !initialPublishData &&
      !isInitializing
    ) {
      getPostCloneInfo(remixSourcePostId)
        .then(setInitialPublishData)
        .catch((err) => console.error('Failed to fetch remix data:', err))
    }
  }, [jamIdFromParams, searchParams, initialPublishData, isInitializing])

  // Log message errors without displaying toasts
  useEffect(() => {
    if (messagesError)
      console.error('Error fetching messages:', messagesError.message)
  }, [messagesError])

  // Display only the most recent messages
  const displayMessages = useMemo(
    () => allMessages.slice(-CHAT_HISTORY_LENGTH),
    [allMessages],
  )

  // Filter selected images for publication
  const imagesToPublish = useMemo(
    () => jamGeneratedImages.filter((img) => selectedImageIds.has(img.id)),
    [jamGeneratedImages, selectedImageIds],
  )

  // Sort images from newest to oldest
  const sortedImages = useMemo(() => {
    return [...jamGeneratedImages].reverse()
  }, [jamGeneratedImages])

  // Handler functions
  const handleSubmitPrompt = (promptText: string) => {
    if (!resolvedJamId || isInitializing || !selectedModel) return

    submitPrompt({
      prompt: promptText,
      modelProvider: selectedModel.provider,
      modelId: selectedModel.value,
      size: selectedSize,
    })
  }

  const handleImageSelect = (imageId: number) => {
    setSelectedImageIds((prev) => {
      const newSet = new Set(prev)
      newSet.has(imageId) ? newSet.delete(imageId) : newSet.add(imageId)
      return newSet
    })
  }

  const handleImageClick = (image: MessageImage) => {
    setActivatedImage(image)
    setShowImagePanel(true)
    // Pre-select the activated image if it's not already selected
    if (!selectedImageIds.has(image.id)) {
      handleImageSelect(image.id)
    }
  }

  const handleClosePanel = () => {
    setShowImagePanel(false)
  }

  const handlePublish = () => {
    if (imagesToPublish.length > 0) {
      setIsPublishSheetOpen(true)
    }
  }

  const handleSaveToGallery = () => {
    // TODO: Implement save to gallery functionality
    console.log('Save to gallery:', Array.from(selectedImageIds))
  }

  // Publish post mutation
  const { mutate: publishPost, isPending: isPublishingPost } = useMutation<
    { postId: number },
    ApiError,
    Omit<CreatePostPayload, 'imageIds' | 'jamId'>
  >({
    mutationFn: async (formData) => {
      if (!resolvedJamId) throw new Error('Jam ID not resolved for publishing')

      const payload: CreatePostPayload = {
        ...formData,
        imageIds: Array.from(selectedImageIds),
        jamId: Number.parseInt(resolvedJamId, 10),
      }

      // Add remix metadata if available
      if (initialPublishData) {
        payload.parentPostId = initialPublishData.parentPostId
        payload.rootPostId = initialPublishData.rootPostId
        payload.generation = initialPublishData.generation
      }

      return createPost(payload)
    },
    onSuccess: (data) => {
      setIsPublishSheetOpen(false)
      setSelectedImageIds(new Set())
      queryClient.invalidateQueries({ queryKey: ['feed', 'latest'] })
      router.push(`/posts/${data.postId}`)
    },
    onError: (error) => console.error('Error publishing post:', error),
  })

  // Loading state
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

  // Error state
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
          <Button
            onClick={() => router.push('/')}
            size="lg"
            className="rounded-full"
          >
            Go to Homepage
          </Button>
        </div>
      </ProtectedPage>
    )
  }

  return (
    <ProtectedPage>
      <div className="flex flex-col h-screen w-full overflow-hidden bg-gradient-to-b from-background to-background/90">
        {/* Header - fixed at top */}
        <header className="px-6 py-4 flex items-center justify-between bg-background/80 backdrop-blur-sm z-10 flex-shrink-0">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full hover:bg-accent/50 mr-2 transition-colors"
              onClick={() => router.push('/')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-semibold">Art Jam</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="rounded-full px-3 gap-2 text-sm font-medium border-accent/30 hover:bg-accent/30 transition-colors"
            >
              <a
                href="https://forms.gle/your-feedback-form-link" // TODO: Replace with your actual feedback form link
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="h-4 w-4" />
                Feedback
              </a>
            </Button>
          </div>
        </header>

        {/* Main content - left chat, right images */}
        <div className="flex-1 flex min-h-0 transition-all duration-300 ease-out">
          {/* Left side - Chat area */}
          <div
            className={cn(
              'flex-1 flex flex-col min-h-0 transition-all duration-300',
              showImagePanel ? 'max-w-[65%]' : 'w-full',
            )}
          >
            {/* Message area - this should scroll independently */}
            <div
              className="flex-1 overflow-y-auto min-h-0 px-2"
              ref={messageContainerRef}
            >
              {displayMessages.length === 0 && !isLoadingMessages ? (
                <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                  <div className="w-16 h-16 rounded-full bg-accent/30 flex items-center justify-center mb-4">
                    <Paintbrush className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-medium mb-2">
                    Start creating art with AI
                  </h3>
                  <p className="text-muted-foreground max-w-md mb-6">
                    Describe the artwork you'd like to create in the input
                    below. Be as descriptive as possible for the best results.
                  </p>
                  <div className="max-w-md text-sm italic bg-accent/30 px-4 py-3 rounded-xl">
                    Try: "A vibrant watercolor painting of a coastal village at
                    sunset, with colorful boats in the harbor"
                  </div>
                </div>
              ) : (
                <MessageList
                  messages={displayMessages}
                  isLoading={isGenerating}
                  onImageClick={handleImageClick}
                  isPanelOpen={showImagePanel}
                />
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat input - fixed at bottom */}
            <div className="mt-auto py-4 px-6 flex-shrink-0 bg-gradient-to-t from-background/90 to-transparent pt-8">
              <ChatInput
                onSubmit={handleSubmitPrompt}
                onModelChange={setSelectedModel}
                currentModelId={selectedModel?.value ?? null}
                isLoading={isGenerating}
                selectedSize={selectedSize}
                onSizeChange={setSelectedSize}
                jamId={resolvedJamId}
              />
            </div>
          </div>

          {/* Right side - Image panel */}
          {showImagePanel && (
            <div className="w-[350px] md:w-[450px] xl:w-[500px] transition-all duration-300 ease-in-out">
              <ImagePanel
                images={sortedImages}
                selectedImage={activatedImage}
                selectedImageIds={selectedImageIds}
                onImageSelect={handleImageSelect}
                onSave={handleSaveToGallery}
                onPublish={handlePublish}
                onClose={handleClosePanel}
              />
            </div>
          )}
        </div>

        {/* Publish sheet */}
        <PublishSheet
          isOpen={isPublishSheetOpen}
          onOpenChange={setIsPublishSheetOpen}
          selectedImages={imagesToPublish}
          onSubmit={publishPost}
          isSubmitting={isPublishingPost}
          initialTitle={initialPublishData?.title || ''}
          initialTags={initialPublishData?.tags || []}
        />
      </div>
    </ProtectedPage>
  )
}
