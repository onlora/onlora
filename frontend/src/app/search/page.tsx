'use client'

import FeedPostCard from '@/components/feed/FeedPostCard'; // Reuse FeedPostCard
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  type PostSearchResultItem,
  type SearchResultsPage,
  type UserSearchResultItem,
  performSearch,
} from '@/lib/api/searchApi'
import { useSession } from '@/lib/authClient'
import { getInitials } from '@/lib/utils'
import { type InfiniteData, useInfiniteQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

const RESULTS_PER_PAGE = 10 // Adjusted for potentially two lists

function SearchResults() {
  const searchParams = useSearchParams()
  const query = searchParams.get('q')
  const { data: session } = useSession() // Needed for potential future authenticated search features

  const {
    data: postsSearchData,
    fetchNextPage: fetchNextPosts,
    hasNextPage: hasNextPostsPage,
    isFetchingNextPage: isFetchingNextPosts,
    isLoading: isLoadingPosts,
    error: postsError,
  } = useInfiniteQuery<
    SearchResultsPage,
    Error,
    InfiniteData<SearchResultsPage>,
    (string | null | undefined)[], // Adjusted QueryKey type
    number
  >({
    queryKey: ['searchPosts', query, session?.user?.id],
    queryFn: ({ pageParam = 0 }) =>
      performSearch({
        q: query!,
        type: 'posts',
        limit: RESULTS_PER_PAGE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.pageInfo.hasNextPage ? lastPage.pageInfo.nextOffset : undefined,
    enabled: !!query,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const {
    data: usersSearchData,
    fetchNextPage: fetchNextUsers,
    hasNextPage: hasNextUsersPage,
    isFetchingNextPage: isFetchingNextUsers,
    isLoading: isLoadingUsers,
    error: usersError,
  } = useInfiniteQuery<
    SearchResultsPage,
    Error,
    InfiniteData<SearchResultsPage>,
    (string | null | undefined)[], // Adjusted QueryKey type
    number
  >({
    queryKey: ['searchUsers', query, session?.user?.id],
    queryFn: ({ pageParam = 0 }) =>
      performSearch({
        q: query!,
        type: 'users',
        limit: RESULTS_PER_PAGE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.pageInfo.hasNextPage ? lastPage.pageInfo.nextOffset : undefined,
    enabled: !!query,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const allPosts =
    postsSearchData?.pages.flatMap((page) => page.posts ?? []) ?? []
  const allUsers =
    usersSearchData?.pages.flatMap((page) => page.users ?? []) ?? []

  if (!query) {
    return (
      <div className="text-center py-10">
        <p className="text-lg text-muted-foreground">
          Please enter a search term to see results.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-12">
      {/* Posts Section */}
      <section>
        <h2 className="text-2xl font-semibold mb-6">
          Posts matching "{query}"
        </h2>
        {isLoadingPosts && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[...Array(RESULTS_PER_PAGE / 2)].map((_, i) => (
              <Skeleton key={`skel-post-${i}`} className="h-72 w-full" />
            ))}
          </div>
        )}
        {postsError && (
          <div className="p-4 text-center text-destructive bg-destructive/10 rounded-md">
            Failed to load post results: {postsError.message}
          </div>
        )}
        {!isLoadingPosts && !postsError && allPosts.length === 0 && (
          <div className="p-4 text-center text-muted-foreground bg-muted/20 rounded-md">
            No posts found matching your search.
          </div>
        )}
        {!isLoadingPosts && !postsError && allPosts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {allPosts.map((post: PostSearchResultItem) => (
              <FeedPostCard key={`post-${post.id}`} post={post} />
            ))}
          </div>
        )}
        {hasNextPostsPage && (
          <div className="mt-6 text-center">
            <Button
              onClick={() => fetchNextPosts()}
              disabled={isFetchingNextPosts}
              variant="outline"
            >
              {isFetchingNextPosts && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Load More Posts
            </Button>
          </div>
        )}
      </section>

      {/* Users Section */}
      <section>
        <h2 className="text-2xl font-semibold mb-6">
          Users matching "{query}"
        </h2>
        {isLoadingUsers && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {[...Array(RESULTS_PER_PAGE / 2)].map((_, i) => (
              <Skeleton key={`skel-user-${i}`} className="h-60 w-full" />
            ))}
          </div>
        )}
        {usersError && (
          <div className="p-4 text-center text-destructive bg-destructive/10 rounded-md">
            Failed to load user results: {usersError.message}
          </div>
        )}
        {!isLoadingUsers && !usersError && allUsers.length === 0 && (
          <div className="p-4 text-center text-muted-foreground bg-muted/20 rounded-md">
            No users found matching your search.
          </div>
        )}
        {!isLoadingUsers && !usersError && allUsers.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {allUsers.map((user: UserSearchResultItem) => (
              <Card
                key={`user-${user.id}`}
                className="overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                <CardContent className="p-4 flex flex-col items-center text-center">
                  <Link href={`/u/${user.username}`} className="block mb-3">
                    <Avatar className="h-20 w-20 mx-auto border-2 border-primary/20">
                      <AvatarImage
                        src={user.image ?? undefined}
                        alt={user.name ?? user.username}
                      />
                      <AvatarFallback className="text-2xl">
                        {getInitials(user.name ?? user.username)}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                  <Link href={`/u/${user.username}`} className="block">
                    <p className="font-semibold text-lg hover:underline">
                      {user.name ?? user.username}
                    </p>
                    <p className="text-sm text-muted-foreground hover:underline">
                      @{user.username}
                    </p>
                  </Link>
                  {user.bio && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2 h-8">
                      {' '}
                      {/* Fixed height for bio */}
                      {user.bio}
                    </p>
                  )}
                  <div className="flex justify-center space-x-3 mt-4 text-xs text-muted-foreground">
                    <span>{user.followerCount} Followers</span>
                    <span>{user.followingCount} Following</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {hasNextUsersPage && (
          <div className="mt-6 text-center">
            <Button
              onClick={() => fetchNextUsers()}
              disabled={isFetchingNextUsers}
              variant="outline"
            >
              {isFetchingNextUsers && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Load More Users
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}

function SearchPageLoadingSkeleton() {
  return (
    <div className="space-y-12">
      <section>
        <Skeleton className="h-8 w-1/3 mb-6" /> {/* Title Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={`skel-post-load-${i}`} className="h-72 w-full" />
          ))}
        </div>
      </section>
      <section>
        <Skeleton className="h-8 w-1/3 mb-6" /> {/* Title Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={`skel-user-load-${i}`} className="h-60 w-full" />
          ))}
        </div>
      </section>
    </div>
  )
}

export default function SearchPage() {
  return (
    <div className="container mx-auto max-w-5xl py-8">
      <Suspense fallback={<SearchPageLoadingSkeleton />}>
        <SearchResults />
      </Suspense>
    </div>
  )
}
