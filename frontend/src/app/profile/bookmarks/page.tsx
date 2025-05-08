'use client'

import FeedPostCard from '@/components/feed/FeedPostCard'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { FeedPost } from '@/lib/api/feedApi'
import {
  type BookmarkedPostsResponse,
  getMyBookmarkedPosts,
} from '@/lib/api/userApi'
import { useSession } from '@/lib/authClient'
import { type InfiniteData, useInfiniteQuery } from '@tanstack/react-query'
import { Info, Loader2, ServerCrash } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo } from 'react'

const BOOKMARKS_PAGE_SIZE = 12

export default function BookmarksPage() {
  const { data: session, isPending: isAuthLoading } = useSession()
  const router = useRouter()

  const isAuthenticated = useMemo(() => {
    if (isAuthLoading) return false
    return !!session?.user
  }, [isAuthLoading, session])

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push('/api/auth/signin/google?callbackUrl=/profile/bookmarks')
    }
  }, [isAuthenticated, isAuthLoading, router])

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
  } = useInfiniteQuery<
    BookmarkedPostsResponse,
    Error,
    InfiniteData<BookmarkedPostsResponse, number>,
    [string],
    number
  >({
    queryKey: ['myBookmarks'],
    queryFn: async ({ pageParam = 0 }) => {
      return getMyBookmarkedPosts({
        limit: BOOKMARKS_PAGE_SIZE,
        offset: pageParam,
      })
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (!lastPage?.meta) return undefined
      const currentCount = lastPage.meta.offset + (lastPage.data?.length || 0)
      if (currentCount < lastPage.meta.totalCount) {
        return currentCount
      }
      return undefined
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
  })

  if (isAuthLoading) {
    return (
      <div className="p-4 md:p-6">
        <h1 className="text-2xl font-semibold mb-4">My Bookmarks</h1>
        <div className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2 text-muted-foreground">
            Checking authentication...
          </p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  if (isLoading) {
    return (
      <div className="p-4 md:p-6">
        <h1 className="text-2xl font-semibold mb-4">My Bookmarks</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {[...Array(BOOKMARKS_PAGE_SIZE)].map((_, i) => (
            <div
              key={`skel-bookmark-${i}`}
              className="border rounded-lg overflow-hidden shadow-sm"
            >
              <div className="p-4 sm:p-5 space-y-3">
                <div className="flex items-center space-x-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <Skeleton className="aspect-video w-full rounded-md" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
              <div className="px-4 sm:px-5 pb-4">
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    const errorMessage =
      error instanceof Error ? error.message : 'An unknown error occurred'
    return (
      <div className="p-4 md:p-6">
        <h1 className="text-2xl font-semibold mb-4">My Bookmarks</h1>
        <Alert variant="destructive">
          <ServerCrash className="h-4 w-4" />
          <AlertTitle>Error Loading Bookmarks</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const allBookmarkedPosts =
    data?.pages.flatMap((page) => page.data ?? []) ?? []

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-semibold mb-6">My Bookmarks</h1>

      {allBookmarkedPosts.length === 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>No Bookmarks Found</AlertTitle>
          <AlertDescription>
            You haven't bookmarked any posts yet. Explore the feed and save your
            favorites!
            <Button variant="link" className="p-0 h-auto ml-1" asChild>
              <Link href="/feed">Go to Feed</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {allBookmarkedPosts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {allBookmarkedPosts.map((bookmarkItem) => {
            const postForCard: FeedPost = {
              id: bookmarkItem.id,
              title: bookmarkItem.title,
              coverImg: bookmarkItem.coverImg,
              createdAt: bookmarkItem.createdAt,
              author: bookmarkItem.author
                ? {
                    id: bookmarkItem.author.id,
                    name: bookmarkItem.author.name,
                    image: bookmarkItem.author.image,
                    username: bookmarkItem.author.username ?? undefined,
                  }
                : null,
              likeCount: bookmarkItem.likeCount,
              commentCount: bookmarkItem.commentCount,
              viewCount: bookmarkItem.viewCount,
              remixCount: bookmarkItem.remixCount,
              score: undefined,
            }
            return (
              <FeedPostCard
                key={`bookmark-${bookmarkItem.id}`}
                post={postForCard}
              />
            )
          })}
        </div>
      )}

      {hasNextPage && (
        <div className="text-center mt-8">
          <Button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            variant="outline"
            size="lg"
          >
            {isFetchingNextPage ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading more...
              </>
            ) : (
              'Load More Bookmarks'
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
