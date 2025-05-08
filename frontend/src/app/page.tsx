'use client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  type InfiniteData,
  type QueryFunctionContext,
  useInfiniteQuery,
} from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'

import FeedPostCard from '@/components/feed/FeedPostCard'
import { Skeleton } from '@/components/ui/skeleton' // For loading state
import {
  type FeedApiResponse, // Ensure FeedPost is imported if used directly
  type FeedPost,
  getFollowingFeed,
  getLatestFeed,
  getTrendingFeed,
} from '@/lib/api/feedApi'

type FeedTab = 'latest' | 'trending' | 'following'

// Updated function signature to match useInfiniteQuery
const fetchFeedData = ({
  pageParam,
  queryKey,
}: QueryFunctionContext<
  [string, FeedTab],
  number | undefined
>): Promise<FeedApiResponse> => {
  const [_key, tab] = queryKey
  // Use pageParam directly, defaulting to 1 if undefined (for the first page)
  const currentPageParam = pageParam ?? 1

  switch (tab) {
    case 'trending':
      return getTrendingFeed(currentPageParam)
    case 'following':
      return getFollowingFeed(currentPageParam) // Assumes logged in, might need check
    default:
      return getLatestFeed(currentPageParam)
  }
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<FeedTab>('latest')

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    status,
  } = useInfiniteQuery<
    FeedApiResponse,
    Error,
    InfiniteData<FeedApiResponse>,
    [string, FeedTab],
    number
  >({
    // Added InfiniteData and PageParam types
    queryKey: ['feed', activeTab],
    queryFn: fetchFeedData,
    getNextPageParam: (lastPage, allPages) => {
      const currentPage = lastPage.meta.page
      const totalPages = lastPage.meta.totalPages
      return currentPage < totalPages ? currentPage + 1 : undefined
    },
    initialPageParam: 1,
  })

  // Add explicit type for page in flatMap
  const allPosts =
    data?.pages.flatMap((page: FeedApiResponse) => page.data) ?? []

  const renderContent = () => {
    if (status === 'pending') {
      // Initial loading skeleton
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton
              key={`skeleton-${i}`}
              className="aspect-[1/1.2] w-full rounded-lg"
            />
          ))}
        </div>
      )
    }

    if (status === 'error') {
      return (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load feed: {error.message}
          </AlertDescription>
        </Alert>
      )
    }

    if (allPosts.length === 0 && !isFetching) {
      return (
        <p className="text-center text-gray-500 dark:text-gray-400 mt-8">
          No posts found in this feed yet.
        </p>
      )
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {allPosts.map((post: FeedPost) => (
          <FeedPostCard key={`${activeTab}-${post.id}`} post={post} />
        ))}
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as FeedTab)}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="latest">Latest</TabsTrigger>
          <TabsTrigger value="trending">Trending</TabsTrigger>
          <TabsTrigger value="following">Following</TabsTrigger>
        </TabsList>

        {/* Content area - reuse the same rendering logic for simplicity */}
        {/* For more distinct tabs, you might use TabsContent, but here we reload based on activeTab state */}
        <div className="mt-4">{renderContent()}</div>
      </Tabs>

      {/* Loading More Button / Indicator */}
      <div className="mt-8 flex justify-center">
        {hasNextPage && (
          <Button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading
                more...
              </>
            ) : (
              'Load More'
            )}
          </Button>
        )}
        {!hasNextPage && allPosts.length > 0 && (
          <p className="text-center text-sm text-gray-500 dark:text-gray-400">
            You've reached the end!
          </p>
        )}
      </div>
    </div>
  )
}
