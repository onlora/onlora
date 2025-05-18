'use client'

import { SignInButton } from '@/components/auth/SignInButton'
import FeedPostCard from '@/components/feed/FeedPostCard'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { FeedPost } from '@/lib/api/feedApi'
import {
  type BookmarkedPostsResponse,
  getMyBookmarkedPosts,
} from '@/lib/api/userApi'
import { useSession } from '@/lib/authClient'
import { type InfiniteData, useInfiniteQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Info, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo } from 'react'

const BOOKMARKS_PAGE_SIZE = 12

const SkeletonCard = () => (
  <div className="bg-background rounded-lg overflow-hidden border border-border/50">
    <div className="p-4 space-y-4">
      <div className="flex items-center space-x-3">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="aspect-video w-full rounded-md" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  </div>
)

export default function BookmarksPage() {
  const { data: session, isPending: isAuthLoading } = useSession()
  const router = useRouter()

  const isAuthenticated = useMemo(() => {
    if (isAuthLoading) return false
    return !!session?.user
  }, [isAuthLoading, session])

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push('/')
    }
  }, [isAuthenticated, isAuthLoading, router])

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
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
      <div className="flex-1 flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[calc(100vh-200px)]">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-bold mb-4">Sign In Required</h1>
          <p className="text-muted-foreground mb-6">
            Please sign in to view your bookmarks
          </p>
          <SignInButton />
        </div>
      </div>
    )
  }

  const allBookmarkedPosts =
    data?.pages.flatMap((page) => page.data ?? []) ?? []

  if (isLoading) {
    return (
      <div className="flex-1">
        <h1 className="text-2xl font-medium px-6 mb-8">Bookmarks</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 px-6">
          {Array.from({ length: BOOKMARKS_PAGE_SIZE }).map((_, i) => (
            <motion.div
              key={`skeleton-${Math.random()}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, delay: i * 0.05 }}
            >
              <SkeletonCard />
            </motion.div>
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex-1">
        <h1 className="text-2xl font-medium px-6 mb-8">Bookmarks</h1>
        <div className="flex flex-col items-center justify-center px-6 py-12">
          <Info className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Failed to load bookmarks</p>
        </div>
      </div>
    )
  }

  if (allBookmarkedPosts.length === 0) {
    return (
      <div className="flex-1">
        <h1 className="text-2xl font-medium px-6 mb-8">Bookmarks</h1>
        <div className="flex flex-col items-center justify-center px-6">
          <div className="max-w-md w-full bg-card/40 rounded-lg px-6 py-8 text-center">
            <h2 className="text-lg font-medium mb-2">No Bookmarks Yet</h2>
            <p className="text-muted-foreground mb-6">
              You haven't bookmarked any posts yet. Explore and save your
              favorites!
            </p>
            <Button asChild variant="outline">
              <Link href="/">Explore Posts</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1">
      <h1 className="text-2xl font-medium px-6 mb-8">Bookmarks</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 px-6">
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
            <motion.div
              key={bookmarkItem.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <FeedPostCard post={postForCard} />
            </motion.div>
          )
        })}
      </div>

      {hasNextPage && (
        <div className="flex justify-center mt-8 pb-8">
          <Button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            variant="outline"
            className="min-w-[120px]"
          >
            {isFetchingNextPage ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading
              </>
            ) : (
              'Load More'
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
