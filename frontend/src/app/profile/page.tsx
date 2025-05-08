'use client'

import ProtectedPage from '@/components/auth/ProtectedPage'
import { ProfilePostCard } from '@/components/profile/ProfilePostCard'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  type ProfilePostItem,
  type ProfilePostsPage,
  type UserProfileData,
  getMyLikedPosts,
  getMyProfile,
} from '@/lib/api/userApi'
import { useSession } from '@/lib/authClient'
import { getInitials } from '@/lib/utils'
import {
  type InfiniteData,
  useInfiniteQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Edit3, Image as ImageIcon, Loader2 } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

const POSTS_PER_PAGE = 12

export default function MyProfilePage() {
  const { data: session } = useSession()
  const loggedInUserId = session?.user?.id
  const queryClient = useQueryClient()

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
    queryKey: ['myProfileWithPosts', loggedInUserId],
    queryFn: ({ pageParam = 0 }) =>
      getMyProfile({ limit: POSTS_PER_PAGE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      return lastPage.posts.pageInfo.hasNextPage
        ? lastPage.posts.pageInfo.nextOffset
        : undefined
    },
    enabled: !!loggedInUserId,
  })

  const user = data?.pages[0]?.user
  const allMyPosts =
    data?.pages.flatMap((page: UserProfileData) => page.posts.items) ?? []

  // --- Query for Liked Posts --- //
  const {
    data: likedData,
    fetchNextPage: fetchNextLikedPage,
    hasNextPage: hasNextLikedPage,
    isFetchingNextPage: isFetchingNextLikedPage,
    isLoading: isLoadingLikedPosts,
    error: likedPostsError,
  } = useInfiniteQuery<
    ProfilePostsPage, // Liked posts endpoint returns ProfilePostsPage directly
    Error,
    InfiniteData<ProfilePostsPage>,
    (string | undefined)[], // QueryKey type
    number // pageParam type
  >({
    queryKey: ['myLikedPosts', loggedInUserId],
    queryFn: ({ pageParam = 0 }) =>
      getMyLikedPosts({ limit: POSTS_PER_PAGE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      return lastPage.pageInfo.hasNextPage
        ? lastPage.pageInfo.nextOffset
        : undefined
    },
    enabled: !!loggedInUserId, // Only run if user is logged in
    staleTime: 5 * 60 * 1000, // Match stale time?
  })

  const allMyLikedPosts = likedData?.pages.flatMap((page) => page.items) ?? []

  if (isLoading) {
    return (
      <ProtectedPage>
        <div className="container mx-auto p-4">
          <p>Loading profile...</p>
        </div>
      </ProtectedPage>
    )
  }

  if (error) {
    return (
      <ProtectedPage>
        <div className="container mx-auto p-4">
          <p className="text-red-500">Error loading profile: {error.message}</p>
        </div>
      </ProtectedPage>
    )
  }

  if (!user && !isLoading) {
    return (
      <ProtectedPage>
        <div className="container mx-auto p-4">
          <p>Could not load user profile data.</p>
        </div>
      </ProtectedPage>
    )
  }

  return (
    <ProtectedPage>
      {user && (
        <div className="container mx-auto max-w-4xl py-8">
          <div className="relative h-48 w-full rounded-t-lg bg-muted md:h-64">
            {user.bannerUrl ? (
              <Image
                src={user.bannerUrl}
                alt={`${user.name || user.username}'s banner`}
                fill
                className="rounded-t-lg object-cover"
                priority
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-t-lg bg-gradient-to-r from-primary/10 to-secondary/10">
                <ImageIcon className="h-12 w-12 text-muted-foreground" />
              </div>
            )}
            <div className="absolute top-4 right-4">
              <Button variant="secondary" size="sm" asChild>
                <Link href="/profile/edit">
                  <Edit3 className="mr-2 h-4 w-4" /> Edit Profile
                </Link>
              </Button>
            </div>
          </div>

          <div className="relative -mt-16 flex flex-col items-center px-4 sm:flex-row sm:items-end sm:space-x-5">
            <Avatar className="h-32 w-32 border-4 border-background sm:h-36 sm:w-36">
              <AvatarImage
                src={user.image ?? undefined}
                alt={user.name || user.username}
              />
              <AvatarFallback className="text-4xl">
                {getInitials(user.name || user.username)}
              </AvatarFallback>
            </Avatar>
            <div className="mt-4 flex flex-col items-center text-center sm:mt-0 sm:items-start sm:text-left">
              <h1 className="text-2xl font-bold sm:text-3xl">
                {user.name || user.username}
              </h1>
              {user.name && (
                <p className="text-sm text-muted-foreground">
                  @{user.username}
                </p>
              )}
              <p className="mt-2 text-sm text-muted-foreground">
                VE: {user.vibeEnergy ?? 0}
              </p>
            </div>
          </div>

          {user.bio && (
            <Card className="mt-6">
              <CardContent className="p-4">
                <p className="text-sm whitespace-pre-wrap">{user.bio}</p>
              </CardContent>
            </Card>
          )}

          <Tabs defaultValue="vibes" className="mt-8 w-full">
            <TabsList className="grid w-full grid-cols-2 md:w-1/2">
              <TabsTrigger value="vibes">
                My Vibes ({allMyPosts.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="likes">Liked Vibes</TabsTrigger>
            </TabsList>
            <TabsContent value="vibes">
              {allMyPosts && allMyPosts.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-4">
                  {allMyPosts.map((post: ProfilePostItem) => (
                    <ProfilePostCard key={post.id} post={post} />
                  ))}
                </div>
              ) : (
                !isLoading &&
                user && (
                  <Card className="mt-4">
                    <CardContent className="pt-6 text-center text-muted-foreground">
                      <p>
                        You haven&apos;t posted any vibes yet. Start creating!
                      </p>
                    </CardContent>
                  </Card>
                )
              )}
              {hasNextPage && (
                <div className="mt-8 flex justify-center">
                  <Button
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                    variant="outline"
                  >
                    {isFetchingNextPage ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />{' '}
                        Loading...
                      </>
                    ) : (
                      'Load More'
                    )}
                  </Button>
                </div>
              )}
            </TabsContent>
            <TabsContent value="likes">
              <Card>
                <CardHeader>
                  <CardTitle>Liked Vibes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-muted-foreground">
                    Vibes you've liked will appear here.
                  </p>
                  {likedPostsError && (
                    <p className="text-red-500 mt-2">
                      Error loading liked vibes: {likedPostsError.message}
                    </p>
                  )}
                  {isLoadingLikedPosts && <p>Loading liked vibes...</p>}
                </CardContent>
              </Card>
              {hasNextLikedPage && (
                <div className="mt-8 flex justify-center">
                  <Button
                    onClick={() => fetchNextLikedPage()}
                    disabled={isFetchingNextLikedPage}
                    variant="outline"
                  >
                    {isFetchingNextLikedPage ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />{' '}
                        Loading...
                      </>
                    ) : (
                      'Load More Liked Vibes'
                    )}
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </ProtectedPage>
  )
}
