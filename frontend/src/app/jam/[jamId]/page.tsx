'use client'

import ProtectedPage from '@/components/auth/ProtectedPage'
import { ChatInput } from '@/components/jam/ChatInput'
import { ImagePanel } from '@/components/jam/ImagePanel'
import { MessageList } from '@/components/jam/MessageList'
import { type PublishData, PublishSheet } from '@/components/jam/PublishSheet'
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
import { toast } from 'sonner'

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

  // Add a local copy of all images from all messages
  const [allAvailableImages, setAllAvailableImages] = useState<MessageImage[]>(
    [],
  )

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

  // Extract all images from messages when they load or change
  useEffect(() => {
    // Only process when messages are loaded and not empty
    if (!isLoadingMessages && allMessages.length > 0) {
      // Extract images from all AI messages
      const allImagesFromMessages: MessageImage[] = []

      for (const message of allMessages) {
        if (
          message.role === 'ai' &&
          message.images &&
          message.images.length > 0
        ) {
          allImagesFromMessages.push(...message.images)
        }
      }

      // Update state with all found images, preserving any existing images not in messages
      if (allImagesFromMessages.length > 0) {
        setAllAvailableImages((prevImages) => {
          // Create a map of existing image IDs for quick lookup
          const existingImageIds = new Set(prevImages.map((img) => img.id))

          // Filter out new images that aren't already in our collection
          const newImages = allImagesFromMessages.filter(
            (img) => !existingImageIds.has(img.id),
          )

          // Only update if we have new images to add
          if (newImages.length > 0) {
            return [...prevImages, ...newImages]
          }

          return prevImages
        })
      }
    }
  }, [allMessages, isLoadingMessages])

  // Debug: log when jamGeneratedImages changes
  useEffect(() => {
    console.log(
      `jamGeneratedImages updated: ${jamGeneratedImages.length} images`,
    )
  }, [jamGeneratedImages])

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
  const imagesToPublish = useMemo(() => {
    // Look for selected images in all available images, not just jamGeneratedImages
    const selectedImages: MessageImage[] = []

    // First check in jamGeneratedImages
    if (jamGeneratedImages.length > 0) {
      const fromGenerated = jamGeneratedImages.filter((img) =>
        selectedImageIds.has(img.id),
      )
      selectedImages.push(...fromGenerated)
    }

    // Then check in allAvailableImages if we haven't found all selected images
    if (
      selectedImages.length < selectedImageIds.size &&
      allAvailableImages.length > 0
    ) {
      const fromAvailable = allAvailableImages.filter(
        (img) =>
          selectedImageIds.has(img.id) &&
          !selectedImages.some((selected) => selected.id === img.id),
      )
      selectedImages.push(...fromAvailable)
    }

    // Finally, try to extract from messages if needed
    if (selectedImages.length < selectedImageIds.size) {
      for (const message of allMessages) {
        if (
          message.role === 'ai' &&
          message.images &&
          message.images.length > 0
        ) {
          const fromMessage = message.images.filter(
            (img) =>
              selectedImageIds.has(img.id) &&
              !selectedImages.some((selected) => selected.id === img.id),
          )
          selectedImages.push(...fromMessage)
        }
      }
    }

    return selectedImages
  }, [jamGeneratedImages, selectedImageIds, allAvailableImages, allMessages])

  // Use all available images as the source for the image panel, not just recent ones
  const imagesForPanel = useMemo(() => {
    // First try to use jamGeneratedImages if available (useJamSession's internal collection)
    if (jamGeneratedImages.length > 0) {
      return [...jamGeneratedImages].reverse()
    }

    // Otherwise fall back to our local collection from all messages
    if (allAvailableImages.length > 0) {
      return [...allAvailableImages].reverse()
    }

    // If nothing else, try extracting images directly from recent messages
    const directFromMessages: MessageImage[] = []
    for (const message of displayMessages) {
      if (
        message.role === 'ai' &&
        message.images &&
        message.images.length > 0
      ) {
        directFromMessages.push(...message.images)
      }
    }

    if (directFromMessages.length > 0) {
      // Also add these to our allAvailableImages collection for future use
      setAllAvailableImages((prev) => {
        const existingIds = new Set(prev.map((img) => img.id))
        const newImages = directFromMessages.filter(
          (img) => !existingIds.has(img.id),
        )
        return newImages.length > 0 ? [...prev, ...newImages] : prev
      })

      return directFromMessages.reverse()
    }

    return []
  }, [jamGeneratedImages, allAvailableImages, displayMessages])

  // Monitor PublishSheet and ensure selected images are available
  useEffect(() => {
    if (isPublishSheetOpen && selectedImageIds.size === 0 && activatedImage) {
      setSelectedImageIds(new Set([activatedImage.id]))
    }
  }, [isPublishSheetOpen, selectedImageIds, activatedImage])

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

  // Enhanced image click handler - when clicking on a message image
  const handleImageClick = (image: MessageImage) => {
    setActivatedImage(image)
    setShowImagePanel(true)

    // Store all available images if not already stored
    setAllAvailableImages((prev) => {
      // Check if this image is already in our collection
      if (prev.some((img) => img.id === image.id)) {
        return prev
      }
      // Add it if it's not already there
      return [...prev, image]
    })

    // Always add the clicked image to selection
    setSelectedImageIds((prev) => {
      const newSet = new Set(prev)
      newSet.add(image.id)
      return newSet
    })
  }

  const handleClosePanel = () => {
    setShowImagePanel(false)
  }

  const handlePublish = () => {
    // If no images are selected but there's an activated image, use that
    if (selectedImageIds.size === 0 && activatedImage) {
      setSelectedImageIds(new Set([activatedImage.id]))
    }

    // Only open publish sheet if we have images to publish
    if (selectedImageIds.size > 0) {
      setIsPublishSheetOpen(true)
    } else {
      alert('Please select at least one image to publish')
    }
  }

  const handleSaveToGallery = () => {
    // TODO: Implement save to gallery functionality
    console.log('Save to gallery:', Array.from(selectedImageIds))

    // Show toast notification
    toast.success(
      `${selectedImageIds.size} image${selectedImageIds.size !== 1 ? 's' : ''} saved to gallery`,
    )
  }

  // Publish post mutation
  const { mutate: publishPost, isPending: isPublishingPost } = useMutation<
    { postId: number },
    ApiError,
    PublishData
  >({
    mutationFn: async (formData) => {
      if (!resolvedJamId) throw new Error('Jam ID not resolved for publishing')

      // Get the image IDs for publishing
      const imageIds = Array.from(selectedImageIds)

      // Fall back to activated image if needed
      if (imageIds.length === 0 && activatedImage) {
        imageIds.push(activatedImage.id)
      }

      // Final check - we need at least one image
      if (imageIds.length === 0) {
        throw new Error('No images selected for publishing')
      }

      const payload: CreatePostPayload = {
        ...formData,
        imageIds: imageIds,
        jamId: Number.parseInt(resolvedJamId, 10),
        visibility: 'public', // Always public when publishing
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
    onError: (error) => {
      console.error('Error publishing post:', error)
    },
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
              {imagesForPanel.length === 0 ? (
                <div className="h-full flex items-center justify-center bg-accent/10 p-6 text-center">
                  <div>
                    <p className="mb-2 text-lg">No images available</p>
                    <p className="text-sm text-muted-foreground">
                      Generate some images with the AI to see them here.
                    </p>
                  </div>
                </div>
              ) : (
                <ImagePanel
                  images={imagesForPanel}
                  selectedImage={activatedImage}
                  selectedImageIds={selectedImageIds}
                  onImageSelect={handleImageSelect}
                  onSave={handleSaveToGallery}
                  onPublish={handlePublish}
                  onClose={handleClosePanel}
                />
              )}
            </div>
          )}
        </div>

        {/* Publish sheet - ensure we always use the most up-to-date image selection */}
        {isPublishSheetOpen && (
          <PublishSheet
            isOpen={isPublishSheetOpen}
            onOpenChange={setIsPublishSheetOpen}
            selectedImages={imagesToPublish}
            onSubmit={publishPost}
            isSubmitting={isPublishingPost}
            initialTitle={initialPublishData?.title || ''}
            initialTags={initialPublishData?.tags || []}
          />
        )}
      </div>
    </ProtectedPage>
  )
}
