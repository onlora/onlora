'use client'

import FeedPostCard from '@/components/feed/FeedPostCard' // Re-use if suitable
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs' // For future use (Posts, Likes, etc.)
import {
  type UserProfileData,
  getUserProfileByUsername,
} from '@/lib/api/userApi' // Adjust import if necessary
import {
  type InfiniteData,
  useInfiniteQuery,
  useQueryClient,
} from '@tanstack/react-query' // Import InfiniteData
import {
  AlertTriangle,
  BarChart2,
  Image as ImageIcon,
  Loader2,
  UserCircle,
} from 'lucide-react' // Icons
import { useParams, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { toast } from 'sonner'

// Helper to get initials
const getInitials = (name?: string | null) => {
  if (!name) return 'U'
  const names = name.split(' ')
  if (names.length === 1) return names[0][0]?.toUpperCase() ?? 'U'
  return (names[0][0] + (names[names.length - 1][0] || '')).toUpperCase()
}

const POSTS_PER_PAGE = 9 // Or whatever limit you set in backend default/query

export default function UserProfilePage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()

  const username = Array.isArray(params.username)
    ? params.username[0]
    : params.username

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
  } = useInfiniteQuery<
    UserProfileData,
    Error,
    InfiniteData<UserProfileData>,
    string[],
    number
  >({
    queryKey: ['userProfile', username as string], // Ensure username is treated as string for queryKey
    queryFn: async ({ pageParam = 0 }) => {
      if (!username) throw new Error('Username is required')
      return getUserProfileByUsername(username, {
        limit: POSTS_PER_PAGE,
        offset: pageParam,
      })
    },
    enabled: !!username,
    getNextPageParam: (lastPage: UserProfileData) => {
      return lastPage.posts.pageInfo.hasNextPage
        ? lastPage.posts.pageInfo.nextOffset
        : undefined
    },
    initialPageParam: 0, // Explicitly set initialPageParam
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  })

  useEffect(() => {
    if (isError && error) {
      toast.error(error.message || 'Failed to load user profile.')
    }
  }, [isError, error])

  if (isLoading && !data) {
    return <UserProfileSkeleton />
  }

  if (isError || !username) {
    return (
      <div className="container mx-auto max-w-4xl p-4 py-8 flex flex-col items-center justify-center min-h-[calc(100vh-200px)]">
        <AlertTriangle className="w-16 h-16 text-red-500 mb-4" />
        <h2 className="text-2xl font-semibold mb-2 text-center">
          Profile Not Found
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6 text-center">
          {error?.message ||
            'The user profile you are looking for does not exist or could not be loaded.'}
        </p>
        <Button onClick={() => router.push('/')}>Go Home</Button>
      </div>
    )
  }

  // Type assertion for data if needed, but direct access should work with correct query typing
  const userProfile = data?.pages[0]?.user
  const allPosts = data?.pages.flatMap((page) => page.posts.items) || []

  if (!userProfile) {
    // This case might happen if the first page loads but user data is somehow missing
    // or if username was initially undefined but enabled flag didn't catch it.
    return (
      <div className="container mx-auto max-w-4xl p-4 py-8 flex flex-col items-center justify-center min-h-[calc(100vh-200px)]">
        <UserCircle className="w-16 h-16 text-gray-400 mb-4" />
        <h2 className="text-2xl font-semibold mb-2">User Data Unavailable</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Could not load user profile details.
        </p>
        <Button onClick={() => router.push('/')}>Go Home</Button>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-5xl p-4 py-8">
      {/* Profile Header */}
      <Card className="mb-8 shadow-lg dark:border-gray-700">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center">
            <Avatar className="w-24 h-24 sm:w-32 sm:h-32 text-4xl border-4 border-white dark:border-gray-800 shadow-md">
              <AvatarImage
                src={userProfile.image ?? undefined}
                alt={userProfile.name ?? userProfile.username}
              />
              <AvatarFallback>{getInitials(userProfile.name)}</AvatarFallback>
            </Avatar>
            <div className="mt-4 sm:mt-0 sm:ml-6 flex-grow">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                {userProfile.name || userProfile.username}
              </h1>
              <p className="text-md text-gray-500 dark:text-gray-400">
                @{userProfile.username}
              </p>
              {userProfile.bio && (
                <p className="mt-2 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">
                  {userProfile.bio}
                </p>
              )}
              <div className="mt-4 flex space-x-4 text-sm text-gray-600 dark:text-gray-400">
                <div>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">
                    {userProfile.followerCount}
                  </span>{' '}
                  Followers
                </div>
                <div>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">
                    {userProfile.followingCount}
                  </span>{' '}
                  Following
                </div>
              </div>
            </div>
            <div className="mt-4 sm:mt-0">
              {/* TODO: Add Edit Profile button if this is current user's profile */}
              {/* TODO: Add Follow/Unfollow button */}
              <Button variant="outline">Follow</Button> {/* Placeholder */}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for Posts, Liked, etc. - Future enhancement */}
      <Tabs defaultValue="posts" className="w-full">
        <TabsList className="grid w-full grid-cols-1 sm:w-auto sm:inline-flex mb-6 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
          <TabsTrigger
            value="posts"
            className="flex-1 data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-gray-700 px-4 py-2 rounded-md text-sm font-medium"
          >
            <ImageIcon className="w-4 h-4 mr-2" /> Posts
          </TabsTrigger>
          {/* <TabsTrigger value="liked">Liked</TabsTrigger> */}
          {/* <TabsTrigger value="gallery">Gallery</TabsTrigger> */}
        </TabsList>
        <TabsContent value="posts">
          {allPosts.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {allPosts.map((post) => (
                <FeedPostCard
                  key={post.id}
                  post={{
                    ...post,
                    author: {
                      id: userProfile.id,
                      name: userProfile.name,
                      image: userProfile.image,
                    },
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <BarChart2 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300">
                No Posts Yet
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                This user hasn't posted anything public yet.
              </p>
            </div>
          )}
          {hasNextPage && (
            <div className="mt-8 flex justify-center">
              <Button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                variant="outline"
                size="lg"
              >
                {isFetchingNextPage ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : null}
                Load More Posts
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function UserProfileSkeleton() {
  return (
    <div className="container mx-auto max-w-5xl p-4 py-8">
      {/* Profile Header Skeleton */}
      <Card className="mb-8 shadow-lg dark:border-gray-700">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center">
            <Skeleton className="w-24 h-24 sm:w-32 sm:h-32 rounded-full" />
            <div className="mt-4 sm:mt-0 sm:ml-6 flex-grow">
              <Skeleton className="h-8 w-48 mb-2" />
              <Skeleton className="h-5 w-32 mb-3" />
              <Skeleton className="h-4 w-full mb-1" />
              <Skeleton className="h-4 w-3/4 mb-3" />
              <div className="flex space-x-4">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-20" />
              </div>
            </div>
            <Skeleton className="h-10 w-24 mt-4 sm:mt-0" />
          </div>
        </CardContent>
      </Card>

      {/* Tabs Skeleton */}
      <div className="w-full mb-6">
        <Skeleton className="h-10 w-24 rounded-lg" />
      </div>

      {/* Posts Grid Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {/* eslint-disable-next-line react/jsx-key */}
        {[...Array(6)].map((_, i) => (
          <Card key={`skeleton-post-${i}`}>
            <CardHeader>
              <Skeleton className="h-40 w-full" />
            </CardHeader>
            <CardContent className="p-4">
              <Skeleton className="h-5 w-3/4 mb-2" />
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
