'use client'

import ProtectedPage from '@/components/auth/ProtectedPage'
import FeedPostCard from '@/components/feed/FeedPostCard' // Use FeedPostCard for display
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  type BookmarkedPostsPage,
  getMyBookmarkedPosts,
} from '@/lib/api/userApi'
import { useSession } from '@/lib/authClient'
import { type InfiniteData, useInfiniteQuery } from '@tanstack/react-query'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

const BOOKMARKS_PER_PAGE = 16

export default function BookmarksDisplayPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const userId = session?.user?.id

  const {
    data: bookmarksData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useInfiniteQuery<
    BookmarkedPostsPage,
    Error,
    InfiniteData<BookmarkedPostsPage>,
    (string | undefined)[], // QueryKey type
    number // PageParam type
  >({
    queryKey: ['myBookmarksPage', userId], // Unique query key
    queryFn: ({ pageParam = 0 }) =>
      getMyBookmarkedPosts({ limit: BOOKMARKS_PER_PAGE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.pageInfo.hasNextPage ? lastPage.pageInfo.nextOffset : undefined,
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const allBookmarkedPosts =
    bookmarksData?.pages.flatMap((page) => page.items) ?? []

  return (
    <ProtectedPage>
      <div className="container mx-auto max-w-4xl py-8">
        <div className="mb-6">
          <Button variant="outline" onClick={() => router.push('/profile')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Profile
          </Button>
        </div>
        <h1 className="text-3xl font-bold mb-6">My Bookmarks</h1>

        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <Card key={`skel-bm-item-${i}`} className="h-[400px]">
                <CardContent className="pt-6">
                  <Skeleton className="h-4/5 w-full mb-4" />
                  <Skeleton className="h-5 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/4" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {error && (
          <Card>
            <CardContent className="pt-6 text-center text-destructive">
              Failed to load bookmarks: {error.message}
            </CardContent>
          </Card>
        )}
        {!isLoading && !error && allBookmarkedPosts.length === 0 && (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              You haven't bookmarked any posts yet.
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && allBookmarkedPosts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {allBookmarkedPosts.map((post) => (
              <FeedPostCard key={post.id} post={post} />
            ))}
          </div>
        )}

        {hasNextPage && (
          <div className="mt-8 flex justify-center">
            <Button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              variant="outline"
            >
              {isFetchingNextPage && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Load More Bookmarks
            </Button>
          </div>
        )}
      </div>
    </ProtectedPage>
  )
}
