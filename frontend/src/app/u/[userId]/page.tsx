'use client'

import FeedPostCard from '@/components/feed/FeedPostCard'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import type { FeedPost } from '@/lib/api/feedApi'
import {
  type BookmarkedPostItem,
  type BookmarkedPostsResponse,
  type ProfilePostItem,
  type ProfilePostsPage,
  type UserProfileData,
  followUser,
  getUserBookmarkedPosts,
  getUserLikedPosts,
  getUserProfile,
  unfollowUser,
} from '@/lib/api/userApi'
import { useSession } from '@/lib/authClient'
import { getInitials } from '@/lib/utils'
import {
  type InfiniteData,
  useInfiniteQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { use } from 'react'
import { toast } from 'sonner'

interface UserProfilePageProps {
  params: Promise<{
    userId: string
  }>
}

const POSTS_PER_PAGE = 12

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

export default function UserProfilePage({ params }: UserProfilePageProps) {
  return <UserProfileContent key={use(params).userId} params={params} />
}

function UserProfileContent({ params }: UserProfilePageProps) {
  const unwrappedParams = use(params)
  const { userId } = unwrappedParams
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const loggedInUserId = session?.user?.id
  const [activeTab, setActiveTab] = useState<'posts' | 'saved' | 'likes'>(
    'posts',
  )
  // State to track follow button UI independently from the query data
  const [isFollowing, setIsFollowing] = useState<boolean | null>(null)
  const [followLoading, setFollowLoading] = useState(false)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  const queryKey = ['userProfile', userId, loggedInUserId]

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useInfiniteQuery<
    UserProfileData,
    Error,
    InfiniteData<UserProfileData>,
    (string | undefined)[],
    number
  >({
    queryKey: queryKey,
    queryFn: ({ pageParam = 0 }) => {
      if (!userId) {
        throw new Error('UserId is required but was not provided.')
      }
      return getUserProfile(userId, {
        limit: POSTS_PER_PAGE,
        offset: pageParam,
      })
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      return lastPage.posts.pageInfo.hasNextPage
        ? lastPage.posts.pageInfo.nextOffset
        : undefined
    },
    enabled: !!userId,
  })

  // Bookmarks Query
  const {
    data: bookmarksData,
    fetchNextPage: fetchNextBookmarksPage,
    hasNextPage: hasNextBookmarksPage,
    isFetchingNextPage: isFetchingNextBookmarksPage,
    isLoading: isLoadingBookmarks,
    error: bookmarksError,
  } = useInfiniteQuery<
    BookmarkedPostsResponse,
    Error,
    InfiniteData<BookmarkedPostsResponse>,
    [string, string],
    number
  >({
    queryKey: ['userBookmarks', userId],
    queryFn: ({ pageParam = 0 }) => {
      if (!userId) {
        throw new Error('UserId is required but was not provided.')
      }
      return getUserBookmarkedPosts(userId, {
        limit: POSTS_PER_PAGE,
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
    enabled: !!userId && activeTab === 'saved',
  })

  // Likes Query
  const {
    data: likesData,
    fetchNextPage: fetchNextLikesPage,
    hasNextPage: hasNextLikesPage,
    isFetchingNextPage: isFetchingNextLikesPage,
    isLoading: isLoadingLikes,
    error: likesError,
  } = useInfiniteQuery<
    ProfilePostsPage,
    Error,
    InfiniteData<ProfilePostsPage>,
    [string, string],
    number
  >({
    queryKey: ['userLikes', userId],
    queryFn: ({ pageParam = 0 }) => {
      if (!userId) {
        throw new Error('UserId is required but was not provided.')
      }
      return getUserLikedPosts(userId, {
        limit: POSTS_PER_PAGE,
        offset: pageParam,
      })
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (!lastPage?.pageInfo) return undefined
      return lastPage.pageInfo.hasNextPage
        ? lastPage.pageInfo.nextOffset
        : undefined
    },
    enabled: !!userId && activeTab === 'likes',
  })

  // Set up infinite scroll for posts
  useEffect(() => {
    if (activeTab !== 'posts' || !loadMoreRef.current || !hasNextPage) {
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
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, activeTab])

  // Set up infinite scroll for bookmarks
  useEffect(() => {
    if (
      activeTab !== 'saved' ||
      !loadMoreRef.current ||
      !hasNextBookmarksPage
    ) {
      return
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextBookmarksPage) {
          fetchNextBookmarksPage()
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
  }, [
    fetchNextBookmarksPage,
    hasNextBookmarksPage,
    isFetchingNextBookmarksPage,
    activeTab,
  ])

  // Set up infinite scroll for likes
  useEffect(() => {
    if (activeTab !== 'likes' || !loadMoreRef.current || !hasNextLikesPage) {
      return
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextLikesPage) {
          fetchNextLikesPage()
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
  }, [fetchNextLikesPage, hasNextLikesPage, isFetchingNextLikesPage, activeTab])

  const user = data?.pages[0]?.user
  const allPosts =
    data?.pages.flatMap((page: UserProfileData) => page.posts.items) ?? []
  const allBookmarks = bookmarksData?.pages.flatMap((page) => page.data) ?? []
  const allLikedPosts = likesData?.pages.flatMap((page) => page.items) ?? []

  // Initialize the isFollowing state from fetched data
  useEffect(() => {
    if (user?.isFollowing !== undefined) {
      setIsFollowing(user.isFollowing)
    }
  }, [user?.isFollowing])

  const isOwnProfile = loggedInUserId === user?.id

  // Direct follow/unfollow without using React Query mutations
  const handleFollowToggle = async () => {
    if (!user?.id) {
      toast.error('User profile not loaded properly.')
      return
    }

    if (!loggedInUserId) {
      toast.error('Please sign in to follow users.')
      return
    }

    if (followLoading) return

    // Optimistically update UI
    setFollowLoading(true)
    const currentlyFollowing = isFollowing ?? user.isFollowing ?? false
    setIsFollowing(!currentlyFollowing)

    try {
      if (currentlyFollowing) {
        // Unfollow user
        await unfollowUser(user.id)
        toast.success('User unfollowed successfully')
      } else {
        // Follow user
        await followUser(user.id)
        toast.success('User followed successfully')
      }

      // Simplified query invalidation - only invalidate the current profile
      queryClient.invalidateQueries({
        queryKey: queryKey,
      })
    } catch (err) {
      // Revert UI on error
      setIsFollowing(currentlyFollowing)
      toast.error(
        `Failed to ${currentlyFollowing ? 'unfollow' : 'follow'}: ${err instanceof Error ? err.message : 'Unknown error'}`,
      )
    } finally {
      setFollowLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-4">
        <div className="flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto p-4">
        <p className="text-red-500">Error loading profile: {error.message}</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="container mx-auto p-4">
        <p>Profile not found for user {userId}.</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      {/* Profile Header - Modern & Minimalist Design */}
      <div className="flex flex-col items-center mb-10">
        {/* Avatar */}
        <Avatar className="h-28 w-28 rounded-full mb-6">
          <AvatarImage
            src={user.image ?? undefined}
            alt={user.name || user.username}
            className="rounded-full object-cover"
          />
          <AvatarFallback className="text-2xl font-medium bg-primary/10 rounded-full">
            {getInitials(user.name || user.username)}
          </AvatarFallback>
        </Avatar>

        {/* User info - centered for simplicity */}
        <h1 className="text-2xl font-bold">{user.name || user.username}</h1>

        <p className="text-muted-foreground mt-1 mb-4">
          {user.username && `@${user.username}`}
        </p>

        {/* Bio with max width for readability */}
        {user.bio && (
          <p className="text-sm text-center max-w-md mb-6">{user.bio}</p>
        )}

        {/* Follow Button - Prominent and simple */}
        {!isOwnProfile && (
          <Button
            variant={
              (isFollowing !== null ? isFollowing : user?.isFollowing)
                ? 'outline'
                : 'default'
            }
            onClick={handleFollowToggle}
            disabled={followLoading}
            className="rounded-full min-w-[120px] h-10 mb-6 transition-all"
          >
            {followLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span>{isFollowing ? 'Unfollowing' : 'Following'}</span>
              </>
            ) : (
              <span>
                {(isFollowing !== null ? isFollowing : user?.isFollowing)
                  ? 'Following'
                  : 'Follow'}
              </span>
            )}
          </Button>
        )}

        {/* Stats - Flat and horizontal with clear separation */}
        <div className="flex gap-12 items-center justify-center mt-1">
          <div className="flex flex-col items-center">
            <span className="text-lg font-semibold">
              {user.followingCount ?? 0}
            </span>
            <span className="text-xs text-muted-foreground">Following</span>
          </div>

          <div className="flex flex-col items-center">
            <span className="text-lg font-semibold">
              {user.followerCount ?? 0}
            </span>
            <span className="text-xs text-muted-foreground">Followers</span>
          </div>

          <div className="flex flex-col items-center">
            <span className="text-lg font-semibold">
              {(user.followerCount ?? 0) * 2}
            </span>
            <span className="text-xs text-muted-foreground">Likes</span>
          </div>
        </div>
      </div>

      {/* Tabs - Simplified and unobtrusive */}
      <div className="flex justify-center mb-8">
        <button
          type="button"
          onClick={() => setActiveTab('posts')}
          className={`px-6 py-2 mx-1 rounded-full text-sm font-medium transition-colors ${
            activeTab === 'posts'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted/30'
          }`}
        >
          Posts
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('saved')}
          className={`px-6 py-2 mx-1 rounded-full text-sm font-medium transition-colors ${
            activeTab === 'saved'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted/30'
          }`}
        >
          Bookmarks
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('likes')}
          className={`px-6 py-2 mx-1 rounded-full text-sm font-medium transition-colors ${
            activeTab === 'likes'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted/30'
          }`}
        >
          Likes
        </button>
      </div>

      {/* Content */}
      <div className="mt-6">
        {activeTab === 'posts' &&
          (allPosts.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-muted-foreground">No posts published yet</p>
            </div>
          ) : (
            <div className="feed-grid">
              {allPosts.map((post: ProfilePostItem) => {
                // Convert ProfilePostItem to FeedPost format for FeedPostCard
                const feedPost: FeedPost = {
                  id: post.id,
                  title: post.title,
                  coverImg: post.coverImg,
                  createdAt: post.createdAt,
                  likeCount: post.likeCount,
                  commentCount: post.commentCount,
                  viewCount: post.viewCount,
                  remixCount: post.remixCount,
                  author: user
                    ? {
                        id: user.id,
                        name: user.name,
                        image: user.image,
                        username: user.username,
                      }
                    : null,
                }

                return (
                  <div
                    key={`post-${post.id}`}
                    className={`masonry-item ${shouldBeTall(post.id) ? 'tall' : ''}`}
                  >
                    <FeedPostCard post={feedPost} />
                  </div>
                )
              })}
            </div>
          ))}

        {activeTab === 'saved' &&
          (isLoadingBookmarks ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : bookmarksError ? (
            <div className="text-center py-10">
              <p className="text-muted-foreground">Error loading bookmarks</p>
            </div>
          ) : allBookmarks.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-muted-foreground">No saved content yet</p>
            </div>
          ) : (
            <div className="feed-grid">
              {allBookmarks.map((bookmark: BookmarkedPostItem) => {
                // Convert BookmarkedPostItem to FeedPost format for FeedPostCard
                const feedPost: FeedPost = {
                  id: bookmark.id,
                  title: bookmark.title,
                  coverImg: bookmark.coverImg,
                  createdAt: bookmark.createdAt,
                  likeCount: bookmark.likeCount,
                  commentCount: bookmark.commentCount,
                  viewCount: bookmark.viewCount,
                  remixCount: bookmark.remixCount,
                  author: bookmark.author
                    ? {
                        id: bookmark.author.id,
                        name: bookmark.author.name,
                        image: bookmark.author.image,
                        username: bookmark.author.username ?? undefined,
                      }
                    : null,
                }

                return (
                  <div
                    key={`bookmark-${bookmark.id}`}
                    className={`masonry-item ${shouldBeTall(bookmark.id) ? 'tall' : ''}`}
                  >
                    <FeedPostCard post={feedPost} />
                  </div>
                )
              })}
            </div>
          ))}

        {activeTab === 'likes' &&
          (isLoadingLikes ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : likesError ? (
            <div className="text-center py-10">
              <p className="text-muted-foreground">
                Error loading liked content
              </p>
            </div>
          ) : allLikedPosts.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-muted-foreground">No liked content yet</p>
            </div>
          ) : (
            <div className="feed-grid">
              {allLikedPosts.map((post: ProfilePostItem) => {
                // Convert ProfilePostItem to FeedPost format for FeedPostCard
                const feedPost: FeedPost = {
                  id: post.id,
                  title: post.title,
                  coverImg: post.coverImg,
                  createdAt: post.createdAt,
                  likeCount: post.likeCount,
                  commentCount: post.commentCount,
                  viewCount: post.viewCount,
                  remixCount: post.remixCount,
                  author: user
                    ? {
                        id: user.id,
                        name: user.name,
                        image: user.image,
                        username: user.username,
                      }
                    : null,
                }

                return (
                  <div
                    key={`like-${post.id}`}
                    className={`masonry-item ${shouldBeTall(post.id) ? 'tall' : ''}`}
                  >
                    <FeedPostCard post={feedPost} />
                  </div>
                )
              })}
            </div>
          ))}
      </div>

      {/* Loading More Indicator */}
      {(activeTab === 'posts' && allPosts.length > 0 && hasNextPage) ||
      (activeTab === 'saved' &&
        allBookmarks.length > 0 &&
        hasNextBookmarksPage) ||
      (activeTab === 'likes' &&
        allLikedPosts.length > 0 &&
        hasNextLikesPage) ? (
        <div ref={loadMoreRef} className="mt-6 flex justify-center h-20">
          {(activeTab === 'posts' && isFetchingNextPage) ||
          (activeTab === 'saved' && isFetchingNextBookmarksPage) ||
          (activeTab === 'likes' && isFetchingNextLikesPage) ? (
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
      ) : (activeTab === 'posts' && allPosts.length > 0) ||
        (activeTab === 'saved' && allBookmarks.length > 0) ||
        (activeTab === 'likes' && allLikedPosts.length > 0) ? (
        <p className="text-center text-sm text-muted-foreground mt-6">
          You've reached the end! ✨
        </p>
      ) : null}
    </div>
  )
}
