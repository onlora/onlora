'use client'

import FeedPostCard from '@/components/feed/FeedPostCard'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  type FeedApiResponse,
  getFollowingFeed,
  getLatestFeed,
  getRecommendedFeed,
  getTrendingFeed,
} from '@/lib/api/feedApi'
import { useSession } from '@/lib/authClient'
import { type InfiniteData, useInfiniteQuery } from '@tanstack/react-query'
import { Loader2, LogIn, ServerCrash } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import type React from 'react'

type FeedType = 'latest' | 'trending' | 'recommended' | 'following'

const FEED_FUNCTIONS: Record<
  FeedType,
  (page: number) => Promise<FeedApiResponse>
> = {
  latest: getLatestFeed,
  trending: getTrendingFeed,
  recommended: getRecommendedFeed,
  following: getFollowingFeed,
}

const FEED_TITLES: Record<FeedType, string> = {
  latest: 'Latest',
  trending: 'Trending',
  recommended: 'Recommended',
  following: 'Following',
}

interface InfiniteQueryData extends FeedApiResponse {}

interface FeedSectionProps {
  feedType: FeedType
  isAuthenticated: boolean
  isAuthLoading: boolean
}

function ResponsiveGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 sm:gap-3">
      {children}
    </div>
  )
}

function FeedSection({
  feedType,
  isAuthenticated,
  isAuthLoading,
}: FeedSectionProps) {
  if (feedType === 'following' && isAuthLoading) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2 text-muted-foreground">Checking authentication...</p>
      </div>
    )
  }

  if (feedType === 'following' && !isAuthenticated && !isAuthLoading) {
    return (
      <div className="text-center py-10 flex flex-col items-center">
        <LogIn className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-xl font-semibold mb-2">
          Login to see your followed posts
        </p>
        <p className="text-muted-foreground mb-6">
          You need to be logged in to view posts from users you follow.
        </p>
        <Button asChild>
          <Link href="/api/auth/signin/google">Login with Google</Link>
        </Button>
      </div>
    )
  }

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
  } = useInfiniteQuery<
    InfiniteQueryData,
    Error,
    InfiniteData<InfiniteQueryData, number>,
    readonly (string | FeedType)[],
    number
  >({
    queryKey:
      feedType === 'following' || feedType === 'recommended'
        ? ['feed', feedType, String(isAuthenticated)]
        : ['feed', feedType],
    queryFn: async ({ pageParam }) => {
      const feedFunction = FEED_FUNCTIONS[feedType]
      return feedFunction(pageParam)
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage: InfiniteQueryData) => {
      if (lastPage.meta.page < lastPage.meta.totalPages) {
        return lastPage.meta.page + 1
      }
      return undefined
    },
    staleTime: 1000 * 60 * 5,
    enabled:
      feedType === 'following'
        ? isAuthenticated && !isAuthLoading
        : !isAuthLoading,
  })

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2 text-muted-foreground">
          Loading {FEED_TITLES[feedType]} posts...
        </p>
      </div>
    )
  }

  if (isError) {
    const errorMessage =
      error instanceof Error ? error.message : 'An unknown error occurred'
    return (
      <div className="flex flex-col items-center justify-center py-10 text-destructive">
        <ServerCrash className="h-10 w-10 mb-2" />
        <p className="text-lg font-semibold">
          Failed to load {FEED_TITLES[feedType]} feed
        </p>
        <p className="text-sm">{errorMessage}</p>
      </div>
    )
  }

  const posts = data?.pages.flatMap((page) => page.data) ?? []

  if (!isLoading && !isError && posts.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-muted-foreground">
          No posts found in the {FEED_TITLES[feedType]} feed yet.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 py-4">
      <ResponsiveGrid>
        {posts.map((post) => (
          <FeedPostCard key={`${feedType}-${post.id}`} post={post} />
        ))}
      </ResponsiveGrid>

      {hasNextPage && (
        <div className="text-center mt-8">
          <Button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            variant="outline"
            className="rounded-full px-8 py-1.5 text-sm font-medium border-gray-300 hover:bg-gray-100"
          >
            {isFetchingNextPage ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading more...
              </>
            ) : (
              'Load more'
            )}
          </Button>
        </div>
      )}
    </div>
  )
}

export default function FeedPage() {
  const [activeTab, setActiveTab] = useState<FeedType>('latest')
  const { data: sessionData, isPending: isAuthLoading } = useSession()

  const isAuthenticated = useMemo(() => {
    if (isAuthLoading) return false
    return !!sessionData?.user
  }, [isAuthLoading, sessionData])

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-6 max-w-7xl">
        {/* Simple header area */}
        <div className="flex justify-between items-center mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Discover
          </h1>

          {/* Could add search or other actions here */}
        </div>

        <Tabs
          defaultValue="latest"
          onValueChange={(value) => setActiveTab(value as FeedType)}
          className="w-full"
        >
          <TabsList className="mb-6 h-auto border-b border-gray-100 bg-transparent p-0 w-auto inline-flex gap-8">
            {(Object.keys(FEED_TITLES) as FeedType[]).map((feedKey) => (
              <TabsTrigger
                key={feedKey}
                value={feedKey}
                className="py-2.5 px-1 text-sm data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-black data-[state=active]:border-b-2 data-[state=active]:border-black rounded-none text-gray-500 font-medium"
              >
                {FEED_TITLES[feedKey]}
              </TabsTrigger>
            ))}
          </TabsList>

          {(Object.keys(FEED_TITLES) as FeedType[]).map((feedKey) => (
            <TabsContent
              key={feedKey}
              value={feedKey}
              className="focus-visible:ring-0 focus-visible:ring-offset-0"
            >
              <FeedSection
                feedType={feedKey}
                isAuthenticated={isAuthenticated}
                isAuthLoading={isAuthLoading}
              />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  )
}
