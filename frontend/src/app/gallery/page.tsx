'use client'

import ProtectedPage from '@/components/auth/ProtectedPage'
import { GalleryPostCard } from '@/components/gallery/GalleryPostCard' // Import GalleryPostCard
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { deleteMyPost, updateMyPost } from '@/lib/api/postApi' // Added imports
import {
  type ProfilePostItem,
  type ProfilePostsPage,
  getMyPosts, // Use the new function
} from '@/lib/api/userApi'
import { useSession } from '@/lib/authClient'
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation, // Added useMutation
  useQueryClient,
} from '@tanstack/react-query'
import { ArrowLeft, Eye, EyeOff, Loader2, Trash2 } from 'lucide-react'
import Link from 'next/link' // For Back to Jam button
import { useRouter, useSearchParams } from 'next/navigation' // For query param and navigation
import { useState } from 'react'
import { toast } from 'sonner' // Added toast

const POSTS_PER_PAGE = 16 // Gallery might show more items

export default function GalleryPage() {
  const { data: session } = useSession()
  const loggedInUserId = session?.user?.id
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const router = useRouter()
  const fromJamId = searchParams.get('fromJamId')

  // State for selection mode
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedPostIds, setSelectedPostIds] = useState<Set<number>>(new Set())

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useInfiniteQuery<
    ProfilePostsPage, // TData for one page
    Error, // TError
    InfiniteData<ProfilePostsPage>, // TQueryData
    (string | undefined)[], // TQueryKey
    number // TPageParam
  >({
    queryKey: ['myGalleryPosts', loggedInUserId],
    queryFn: ({ pageParam = 0 }) =>
      getMyPosts({ limit: POSTS_PER_PAGE, offset: pageParam }), // Fetch all posts (public/private)
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      return lastPage.pageInfo.hasNextPage
        ? lastPage.pageInfo.nextOffset
        : undefined
    },
    enabled: !!loggedInUserId, // Only run if user is logged in
  })

  const allPosts = data?.pages.flatMap((page) => page.items) ?? []

  // Handler to toggle post selection
  const handleToggleSelectPost = (postId: number) => {
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

  // --- Mutations for Batch Actions --- //

  const deleteMutation = useMutation<void, Error, { postIds: number[] }>({
    // Accepts an array of IDs
    mutationFn: async ({ postIds }) => {
      // Perform deletions sequentially or in parallel
      // Parallel might be faster but could overwhelm backend/DB if too many
      // Sequential is simpler to reason about for errors.
      for (const postId of postIds) {
        await deleteMyPost(String(postId)) // Convert number to string for API
      }
      // Alternative: Promise.all for parallel
      // await Promise.all(postIds.map(id => deleteMyPost(String(id))));
    },
    onSuccess: (_data, variables) => {
      toast.success(`${variables.postIds.length} post(s) deleted successfully.`)
      queryClient.invalidateQueries({ queryKey: ['myGalleryPosts'] })
      setSelectedPostIds(new Set()) // Clear selection
      setSelectionMode(false) // Exit selection mode
    },
    onError: (error, variables) => {
      toast.error(
        `Failed to delete ${variables.postIds.length} post(s): ${error.message}`,
      )
      // Consider leaving selection mode active so user can retry?
      // Or partially clear selection? For now, just shows error.
    },
  })

  const updateVisibilityMutation = useMutation<
    void,
    Error,
    { postIds: number[]; visibility: 'public' | 'private' }
  >({
    mutationFn: async ({ postIds, visibility }) => {
      for (const postId of postIds) {
        await updateMyPost(String(postId), { visibility })
      }
      // Could also run in parallel: Promise.all(...)
    },
    onSuccess: (_data, variables) => {
      toast.success(
        `${variables.postIds.length} post(s) updated to ${variables.visibility}.`,
      )
      queryClient.invalidateQueries({ queryKey: ['myGalleryPosts'] })
      setSelectedPostIds(new Set()) // Clear selection
      setSelectionMode(false) // Exit selection mode
    },
    onError: (error, variables) => {
      toast.error(
        `Failed to update visibility for ${variables.postIds.length} post(s): ${error.message}`,
      )
    },
  })

  // Confirmation and execution handler for delete
  const handleDeleteSelected = () => {
    if (selectedPostIds.size === 0) return
    if (
      window.confirm(
        `Are you sure you want to delete ${selectedPostIds.size} selected post(s)? This action cannot be undone.`,
      )
    ) {
      deleteMutation.mutate({ postIds: Array.from(selectedPostIds) })
    }
  }

  if (isLoading) {
    return (
      <ProtectedPage>
        <div className="container mx-auto p-4">
          <p>Loading gallery...</p> {/* TODO: Skeleton */}
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
      <div className="container mx-auto py-8">
        {fromJamId && (
          <div className="mb-6">
            <Button
              variant="outline"
              onClick={() => router.push(`/jam/${fromJamId}`)}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Jam Session
            </Button>
          </div>
        )}
        <h1 className="text-3xl font-bold mb-6">My Gallery</h1>

        {/* TODO: Add Filtering (Public/Private) and Batch Actions (Select, Delete, Change Visibility) */}
        <div className="mb-6 flex space-x-2">
          <Button variant="outline" disabled>
            Filter (All)
          </Button>
          <Button
            variant={selectionMode ? 'destructive' : 'outline'}
            onClick={() => {
              setSelectionMode(!selectionMode)
              setSelectedPostIds(new Set()) // Clear selection when toggling mode
            }}
          >
            {selectionMode ? 'Cancel' : 'Select'}
          </Button>

          {/* Batch Action Buttons - Show when in selection mode and items are selected */}
          {selectionMode && selectedPostIds.size > 0 && (
            <div className="flex space-x-2 ml-auto border-l pl-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  updateVisibilityMutation.mutate({
                    postIds: Array.from(selectedPostIds),
                    visibility: 'public',
                  })
                }
                disabled={updateVisibilityMutation.isPending} // Disable while updating
              >
                {updateVisibilityMutation.isPending &&
                updateVisibilityMutation.variables?.visibility === 'public' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Eye className="mr-2 h-4 w-4" />
                )}
                Make Public
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  updateVisibilityMutation.mutate({
                    postIds: Array.from(selectedPostIds),
                    visibility: 'private',
                  })
                }
                disabled={updateVisibilityMutation.isPending} // Disable while updating
              >
                {updateVisibilityMutation.isPending &&
                updateVisibilityMutation.variables?.visibility === 'private' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <EyeOff className="mr-2 h-4 w-4" />
                )}
                Make Private
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteSelected} // Use the handler
                disabled={deleteMutation.isPending} // Disable while deleting
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Delete ({selectedPostIds.size})
              </Button>
            </div>
          )}
        </div>

        {allPosts.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {allPosts.map((post: ProfilePostItem) => (
              <GalleryPostCard
                key={post.id}
                post={post}
                selectionMode={selectionMode}
                isSelected={selectedPostIds.has(post.id)}
                onToggleSelect={handleToggleSelectPost}
              />
            ))}
          </div>
        ) : (
          <Card className="mt-4">
            <CardContent className="pt-6 text-center text-muted-foreground">
              <p>Your gallery is empty. Start creating some vibes!</p>
              <Button asChild className="mt-4">
                <Link href="/jam/new">Create New Vibe</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Load More Button */}
        {hasNextPage && (
          <div className="mt-8 flex justify-center">
            <Button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              variant="outline"
            >
              {isFetchingNextPage ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
                </>
              ) : (
                'Load More Posts'
              )}
            </Button>
          </div>
        )}
      </div>
    </ProtectedPage>
  )
}
