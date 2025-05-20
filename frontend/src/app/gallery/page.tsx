'use client'

import ProtectedPage from '@/components/auth/ProtectedPage'
import FeedPostCard from '@/components/feed/FeedPostCard'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { FeedPost } from '@/lib/api/feedApi'
import { deleteMyPost, updateMyPost } from '@/lib/api/postApi'
import {
  type ProfilePostItem,
  type ProfilePostsPage,
  getMyPosts,
} from '@/lib/api/userApi'
import { useSession } from '@/lib/authClient'
import { cn } from '@/lib/utils'
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  LayoutGrid,
  Loader2,
  Settings,
  Trash2,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

const POSTS_PER_PAGE = 16

// Extended interface to include the visibility property that comes from the API
interface GalleryPostItem extends ProfilePostItem {
  visibility?: 'public' | 'private'
}

// Define gallery filter types
type GalleryFilter = 'all' | 'public' | 'private'

// Helper function to determine if a post should use the tall style
const shouldBeTall = (postId: string | number): boolean => {
  // Convert to string if it's a number
  const id = typeof postId === 'number' ? String(postId) : postId
  // Simple hash function that sums the char codes in the ID
  const hashSum = id
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0)
  // Use the hash to create a pattern - approximately 40% of posts will be tall
  return hashSum % 5 === 0 || hashSum % 5 === 3
}

function GalleryContent() {
  const { data: session } = useSession()
  const loggedInUserId = session?.user?.id
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const router = useRouter()
  const fromJamId = searchParams.get('fromJamId')
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  // State for selection mode
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(new Set())

  // Add visibility filter state
  const [visibilityFilter, setVisibilityFilter] = useState<GalleryFilter>('all')

  // State for confirmation dialogs
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [visibilityAction, setVisibilityAction] = useState<
    'public' | 'private' | null
  >(null)

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
    refetch,
  } = useInfiniteQuery<
    ProfilePostsPage,
    Error,
    InfiniteData<ProfilePostsPage>,
    (string | undefined)[],
    number
  >({
    queryKey: ['myGalleryPosts', loggedInUserId, visibilityFilter],
    queryFn: ({ pageParam = 0 }) => {
      // Only pass visibility filter if not 'all'
      const visibilityParam =
        visibilityFilter !== 'all' ? visibilityFilter : undefined
      return getMyPosts(
        { limit: POSTS_PER_PAGE, offset: pageParam },
        visibilityParam,
      )
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      return lastPage.pageInfo.hasNextPage
        ? lastPage.pageInfo.nextOffset
        : undefined
    },
    enabled: !!loggedInUserId,
  })

  // Reset scroll position and refetch data when visibility filter changes
  useEffect(() => {
    // Reset scroll position when tab changes
    window.scrollTo(0, 0)

    // Reset the observer when visibility changes
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }

    // Force a refetch when visibility filter changes
    if (loggedInUserId) {
      refetch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedInUserId, refetch])

  // Set up infinite scroll
  useEffect(() => {
    if (!loadMoreRef.current || !hasNextPage) {
      return
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { threshold: 0.5 },
    )

    observerRef.current.observe(loadMoreRef.current)

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  const allPosts = data?.pages.flatMap((page) => page.items) ?? []

  // Add a debug effect to inspect the post data
  useEffect(() => {
    if (allPosts.length > 0) {
      console.log('Sample post data:', allPosts[0])
    }
  }, [allPosts])

  // No need to filter posts here anymore, as we're requesting filtered data from backend
  const filteredPosts = allPosts

  // Toggle all posts selection
  const toggleSelectAllPosts = () => {
    if (selectedPostIds.size === allPosts.length) {
      // If all are selected, clear selection
      setSelectedPostIds(new Set())
    } else {
      // Otherwise select all
      setSelectedPostIds(new Set(allPosts.map((post) => post.id)))
    }
  }

  // Handler to toggle post selection
  const handleToggleSelectPost = (postId: string) => {
    if (!selectionMode) return // 只在选择模式下生效

    setSelectedPostIds((prevSelectedIds) => {
      const newSelectedIds = new Set(prevSelectedIds)
      if (newSelectedIds.has(postId)) {
        newSelectedIds.delete(postId)
      } else {
        newSelectedIds.add(postId)
      }
      return newSelectedIds
    })
  }

  // Exit selection mode and clear selections
  const exitSelectionMode = () => {
    setSelectionMode(false)
    setSelectedPostIds(new Set())
  }

  // --- Mutations for Batch Actions --- //

  const deleteMutation = useMutation<void, Error, { postIds: string[] }>({
    mutationFn: async ({ postIds }) => {
      for (const postId of postIds) {
        await deleteMyPost(postId)
      }
    },
    onSuccess: (_data, variables) => {
      toast.success(`${variables.postIds.length} post(s) deleted successfully.`)
      queryClient.invalidateQueries({ queryKey: ['myGalleryPosts'] })
      exitSelectionMode()
    },
    onError: (error, variables) => {
      toast.error(
        `Failed to delete ${variables.postIds.length} post(s): ${error.message}`,
      )
    },
  })

  const updateVisibilityMutation = useMutation<
    void,
    Error,
    { postIds: string[]; visibility: 'public' | 'private' }
  >({
    mutationFn: async ({ postIds, visibility }) => {
      for (const postId of postIds) {
        await updateMyPost(postId, { visibility })
      }
    },
    onSuccess: (_data, variables) => {
      toast.success(
        `${variables.postIds.length} post(s) updated to ${variables.visibility}.`,
      )
      queryClient.invalidateQueries({ queryKey: ['myGalleryPosts'] })
      setVisibilityAction(null)
      exitSelectionMode()
    },
    onError: (error, variables) => {
      toast.error(
        `Failed to update visibility for ${variables.postIds.length} post(s): ${error.message}`,
      )
      setVisibilityAction(null)
    },
  })

  // Confirmation and execution handler for delete
  const handleDeleteSelected = () => {
    if (selectedPostIds.size === 0) return
    setDeleteDialogOpen(true)
  }

  // Execution handler for visibility change
  const handleUpdateVisibility = (visibility: 'public' | 'private') => {
    if (selectedPostIds.size === 0) return
    setVisibilityAction(visibility)
  }

  // Confirmation handlers
  const confirmDelete = () => {
    deleteMutation.mutate({ postIds: Array.from(selectedPostIds) })
    setDeleteDialogOpen(false)
  }

  const confirmVisibilityChange = () => {
    if (!visibilityAction) return
    updateVisibilityMutation.mutate({
      postIds: Array.from(selectedPostIds),
      visibility: visibilityAction,
    })
  }

  if (isLoading) {
    return (
      <ProtectedPage>
        <div className="container mx-auto p-4">
          <div className="flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </div>
      </ProtectedPage>
    )
  }

  if (error) {
    return (
      <ProtectedPage>
        <div className="container mx-auto p-4">
          <p className="text-red-500">Error loading gallery: {error.message}</p>
        </div>
      </ProtectedPage>
    )
  }

  return (
    <ProtectedPage>
      <TooltipProvider>
        <div className="px-4 sm:px-6 py-4 max-w-7xl mx-auto">
          {/* Header with Select/Action Options */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              {fromJamId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-full"
                  onClick={() => router.push(`/jam/${fromJamId}`)}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Jam
                </Button>
              )}
              <h1 className="text-2xl font-semibold flex items-center">
                <LayoutGrid className="mr-2 h-5 w-5 text-muted-foreground" />
                My Gallery
              </h1>
            </div>

            <div className="flex items-center gap-2">
              {/* Selection toggle button */}
              <Button
                variant={selectionMode ? 'outline' : 'outline'}
                size="sm"
                className={cn(
                  'h-9 rounded-full flex gap-1.5 items-center',
                  selectionMode && 'text-primary border-primary',
                )}
                onClick={() => {
                  if (selectionMode) {
                    exitSelectionMode()
                  } else {
                    setSelectionMode(true)
                  }
                }}
              >
                {selectionMode ? (
                  <>
                    <X className="h-4 w-4" />
                    Cancel
                  </>
                ) : (
                  <>
                    <Settings className="h-4 w-4" />
                    Manage
                  </>
                )}
              </Button>

              {/* Actions dropdown - only visible in selection mode with items selected */}
              {selectionMode && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    asChild
                    disabled={selectedPostIds.size === 0}
                  >
                    <Button
                      variant="default"
                      size="sm"
                      className={cn(
                        'h-9 rounded-full gap-1.5',
                        selectedPostIds.size === 0 &&
                          'opacity-50 cursor-not-allowed',
                      )}
                    >
                      Actions
                      {selectedPostIds.size > 0 && (
                        <Badge
                          variant="secondary"
                          className="ml-1 h-5 rounded-full px-1.5 bg-primary/25 text-primary"
                        >
                          {selectedPostIds.size}
                        </Badge>
                      )}
                      <ChevronDown className="h-4 w-4 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="min-w-[180px] rounded-xl"
                  >
                    <DropdownMenuItem
                      onClick={toggleSelectAllPosts}
                      className="cursor-pointer"
                    >
                      {selectedPostIds.size === allPosts.length ? (
                        <>Unselect All</>
                      ) : (
                        <>Select All</>
                      )}
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                      onClick={() => handleUpdateVisibility('public')}
                      disabled={updateVisibilityMutation.isPending}
                      className="cursor-pointer"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Make Public
                      {updateVisibilityMutation.isPending &&
                        visibilityAction === 'public' && (
                          <Loader2 className="ml-auto h-4 w-4 animate-spin" />
                        )}
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={() => handleUpdateVisibility('private')}
                      disabled={updateVisibilityMutation.isPending}
                      className="cursor-pointer"
                    >
                      <EyeOff className="h-4 w-4 mr-2" />
                      Make Private
                      {updateVisibilityMutation.isPending &&
                        visibilityAction === 'private' && (
                          <Loader2 className="ml-auto h-4 w-4 animate-spin" />
                        )}
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                      onClick={handleDeleteSelected}
                      disabled={deleteMutation.isPending}
                      className="text-destructive cursor-pointer focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                      {deleteMutation.isPending && (
                        <Loader2 className="ml-auto h-4 w-4 animate-spin" />
                      )}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {/* Visibility filter tabs - styled like page.tsx */}
          <div className="mb-6 overflow-x-auto hide-scrollbar">
            <div className="flex gap-2 min-w-max">
              <button
                type="button"
                onClick={() => setVisibilityFilter('all')}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  visibilityFilter === 'all'
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                }`}
              >
                Latest
              </button>
              <button
                type="button"
                onClick={() => setVisibilityFilter('public')}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center ${
                  visibilityFilter === 'public'
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                }`}
              >
                <Eye className="mr-1.5 h-3.5 w-3.5" />
                Public
              </button>
              <button
                type="button"
                onClick={() => setVisibilityFilter('private')}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center ${
                  visibilityFilter === 'private'
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                }`}
              >
                <EyeOff className="mr-1.5 h-3.5 w-3.5" />
                Private
              </button>
            </div>
          </div>

          {filteredPosts.length > 0 ? (
            <div className="feed-grid">
              {filteredPosts.map((post: ProfilePostItem) => {
                // Cast to our extended interface with the visibility property
                const galleryPost = post as GalleryPostItem
                const isPrivate = galleryPost.visibility === 'private'
                const isSelected = selectedPostIds.has(galleryPost.id)

                // Convert ProfilePostItem to FeedPost format for FeedPostCard
                const feedPost: FeedPost = {
                  id: galleryPost.id,
                  title: galleryPost.title,
                  coverImg: galleryPost.coverImg,
                  createdAt: galleryPost.createdAt,
                  likeCount: galleryPost.likeCount,
                  commentCount: galleryPost.commentCount,
                  viewCount: galleryPost.viewCount,
                  remixCount: galleryPost.remixCount,
                  author: session?.user
                    ? {
                        id: session.user.id,
                        name: session.user.name,
                        image: session.user.image || null,
                        username: undefined,
                      }
                    : null,
                }

                // Completely separate rendering for selection mode and browse mode
                if (selectionMode) {
                  // Selection mode - no Link elements to avoid navigation
                  return (
                    <div
                      key={`post-${galleryPost.id}`}
                      className={cn(
                        'masonry-item relative group',
                        shouldBeTall(galleryPost.id) ? 'tall' : '',
                        'cursor-pointer transition-all',
                      )}
                    >
                      {/* Large clickable area for selection */}
                      <div
                        className="absolute inset-0 z-10"
                        onClick={() => handleToggleSelectPost(galleryPost.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            handleToggleSelectPost(galleryPost.id)
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label={
                          isSelected ? 'Unselect this post' : 'Select this post'
                        }
                      />

                      {/* Selection checkbox indicator */}
                      <div className="absolute top-2 right-2 z-20">
                        <button
                          type="button"
                          className={cn(
                            'h-8 w-8 rounded-full flex items-center justify-center',
                            isSelected
                              ? 'bg-black text-white'
                              : 'bg-black/40 backdrop-blur-sm',
                          )}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleToggleSelectPost(galleryPost.id)
                          }}
                        >
                          {isSelected && <Check className="h-4 w-4" />}
                        </button>
                      </div>

                      {/* Privacy indicator badge */}
                      {isPrivate && visibilityFilter === 'all' && (
                        <div className="absolute top-2 left-2 z-20">
                          <Badge
                            variant="secondary"
                            className="bg-secondary/80 text-xs font-normal"
                          >
                            <EyeOff className="h-3 w-3 mr-1" />
                            Private
                          </Badge>
                        </div>
                      )}

                      {/* Post card content - no navigation */}
                      <FeedPostCard post={feedPost} />
                    </div>
                  )
                }

                // Browse mode - use Link for navigation
                return (
                  <div
                    key={`post-${galleryPost.id}`}
                    className={cn(
                      'masonry-item relative group',
                      shouldBeTall(galleryPost.id) ? 'tall' : '',
                    )}
                  >
                    {/* Privacy indicator badge */}
                    {isPrivate && visibilityFilter === 'all' && (
                      <div className="absolute top-2 left-2 z-10">
                        <Badge
                          variant="secondary"
                          className="bg-secondary/80 text-xs font-normal"
                        >
                          <EyeOff className="h-3 w-3 mr-1" />
                          Private
                        </Badge>
                      </div>
                    )}

                    {/* Normal navigation with Link */}
                    <Link href={`/posts/${galleryPost.id}`}>
                      <FeedPostCard post={feedPost} />
                    </Link>
                  </div>
                )
              })}
            </div>
          ) : (
            <Card className="mt-4 border border-border rounded-xl">
              <CardContent className="pt-10 pb-10 text-center">
                <p className="text-muted-foreground">
                  {visibilityFilter === 'all'
                    ? 'Your gallery is empty. Start creating some vibes!'
                    : `No ${visibilityFilter} posts found.`}
                </p>
                <Button asChild className="mt-4 rounded-full">
                  <Link href="/jam/new">Create New Vibe</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Loading More Indicator */}
          {filteredPosts.length > 0 && hasNextPage && (
            <div ref={loadMoreRef} className="mt-6 flex justify-center h-20">
              {isFetchingNextPage ? (
                <div className="flex items-center text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  <span className="text-sm">Loading more...</span>
                </div>
              ) : (
                <p className="text-center text-sm text-muted-foreground">
                  Scroll for more
                </p>
              )}
            </div>
          )}

          {filteredPosts.length > 0 && !hasNextPage && (
            <p className="text-center text-sm text-muted-foreground mt-6">
              You've reached the end! ✨
            </p>
          )}

          {/* Delete confirmation dialog */}
          <AlertDialog
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
          >
            <AlertDialogContent className="rounded-xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete {selectedPostIds.size}{' '}
                  selected items? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-full">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmDelete}
                  className="rounded-full bg-destructive"
                >
                  {deleteMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    'Delete'
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Visibility change confirmation dialog */}
          <AlertDialog
            open={visibilityAction !== null}
            onOpenChange={(open: boolean) => !open && setVisibilityAction(null)}
          >
            <AlertDialogContent className="rounded-xl">
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Confirm {visibilityAction === 'public' ? 'Public' : 'Private'}{' '}
                  Status
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {visibilityAction === 'public'
                    ? `Are you sure you want to make ${selectedPostIds.size} selected items public? They will be visible to everyone.`
                    : `Are you sure you want to make ${selectedPostIds.size} selected items private? They will only be visible to you.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel
                  className="rounded-full"
                  onClick={() => setVisibilityAction(null)}
                >
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmVisibilityChange}
                  className="rounded-full"
                >
                  {updateVisibilityMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Confirm'
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </TooltipProvider>
    </ProtectedPage>
  )
}

export default function GalleryPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <GalleryContent />
    </Suspense>
  )
}
