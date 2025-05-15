'use client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  type InfiniteData,
  type QueryFunctionContext,
  useInfiniteQuery,
} from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

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
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)

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

  // Set up infinite scroll
  useEffect(() => {
    if (loadMoreRef.current && hasNextPage) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && !isFetchingNextPage) {
            fetchNextPage()
          }
        },
        { threshold: 0.5 },
      )

      observerRef.current.observe(loadMoreRef.current)
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  // Add explicit type for page in flatMap
  const allPosts =
    data?.pages.flatMap((page: FeedApiResponse) => page.data) ?? []

  const renderContent = () => {
    if (status === 'pending') {
      // Initial loading skeleton with variable heights
      return (
        <div className="feed-grid">
          {[...Array(8)].map((_, i) => (
            <div
              // Use UUID-like pattern for skeleton keys to avoid index warnings
              key={`skeleton-${i}-${Math.random().toString(36).substr(2, 9)}`}
              className="w-full"
            >
              <Skeleton className="w-full rounded-xl aspect-[3/4]" />
            </div>
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
        <p className="text-center text-muted-foreground mt-8">
          No posts found in this feed yet.
        </p>
      )
    }

    return (
      <div className="feed-grid">
        {allPosts.map((post: FeedPost) => (
          <div key={`post-${post.id}`} className="w-full">
            <FeedPostCard post={post} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6 py-0 max-w-7xl mx-auto">
      {/* Feed tabs */}
      <div className="mb-6 overflow-x-auto hide-scrollbar sticky top-0 bg-background/95 backdrop-blur z-10">
        <div className="flex gap-2 min-w-max">
          <button
            type="button"
            onClick={() => setActiveTab('latest')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeTab === 'latest'
                ? 'bg-primary/10 text-primary'
                : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
            }`}
          >
            Latest
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('trending')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeTab === 'trending'
                ? 'bg-primary/10 text-primary'
                : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
            }`}
          >
            Trending
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('following')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeTab === 'following'
                ? 'bg-primary/10 text-primary'
                : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
            }`}
          >
            Following
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="mt-3">{renderContent()}</div>

      {/* Loading More Indicator */}
      <div ref={loadMoreRef} className="mt-6 flex justify-center h-20">
        {isFetchingNextPage && (
          <div className="flex items-center text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            <span className="text-sm">Loading more...</span>
          </div>
        )}
        {!hasNextPage && allPosts.length > 0 && (
          <p className="text-center text-sm text-muted-foreground">
            You've seen it all! ✨
          </p>
        )}
      </div>
    </div>
  )
}
