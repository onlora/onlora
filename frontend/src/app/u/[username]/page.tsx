'use client'

import { ProfilePostCard } from '@/components/profile/ProfilePostCard'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  type ProfilePostItem,
  type UserProfileData,
  followUser,
  getUserProfileByUsername,
  unfollowUser,
} from '@/lib/api/userApi'
import { authClient, useSession } from '@/lib/authClient'
import { getInitials } from '@/lib/utils'
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { ImageIcon, Loader2, UserCheck, UserPlus } from 'lucide-react'
import Image from 'next/image'
import { toast } from 'sonner'

interface UserProfilePageProps {
  params: {
    username: string
  }
}

const POSTS_PER_PAGE = 12

export default function UserProfilePage({ params }: UserProfilePageProps) {
  const { username } = params
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const loggedInUserId = session?.user?.id

  const queryKey = ['userProfile', username, loggedInUserId]

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
      if (!username) {
        throw new Error('Username is required but was not provided.')
      }
      return getUserProfileByUsername(username, {
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
    enabled: !!username,
  })

  const user = data?.pages[0]?.user
  const allPosts =
    data?.pages.flatMap((page: UserProfileData) => page.posts.items) ?? []

  const isOwnProfile = loggedInUserId === user?.id

  const followMutation = useMutation({
    mutationFn: () => followUser(user?.id ?? ''),
    onSuccess: () => {
      toast.success(`Followed @${username}`)
      queryClient.invalidateQueries({ queryKey: queryKey })
    },
    onError: (err) => {
      toast.error(`Failed to follow: ${err.message}`)
    },
  })

  const unfollowMutation = useMutation({
    mutationFn: () => unfollowUser(user?.id ?? ''),
    onSuccess: () => {
      toast.success(`Unfollowed @${username}`)
      queryClient.invalidateQueries({ queryKey: queryKey })
    },
    onError: (err) => {
      toast.error(`Failed to unfollow: ${err.message}`)
    },
  })

  const handleFollowToggle = () => {
    if (!user?.id) return
    if (!loggedInUserId) {
      toast.error('Please sign in to follow users.')
      return
    }
    if (user.isFollowing) {
      unfollowMutation.mutate()
    } else {
      followMutation.mutate()
    }
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-4">
        <p>Loading profile for @{username}...</p>{' '}
        {/* TODO: Add Skeleton Loader */}
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
        <p>Profile not found for @{username}.</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-4xl py-8">
      {/* Banner Image */}
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
        {!isOwnProfile && loggedInUserId && (
          <div className="absolute top-4 right-4">
            <Button
              variant={user.isFollowing ? 'secondary' : 'default'}
              size="sm"
              onClick={handleFollowToggle}
              disabled={
                !user?.id ||
                followMutation.isPending ||
                unfollowMutation.isPending
              }
            >
              {user.isFollowing ? (
                <>
                  <UserCheck className="mr-2 h-4 w-4" /> Following
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" /> Follow
                </>
              )}
            </Button>
          </div>
        )}
        {!loggedInUserId && !isOwnProfile && (
          <div className="absolute top-4 right-4">
            <Button
              variant="default"
              size="sm"
              onClick={() => authClient.signIn.social({ provider: 'google' })}
            >
              <UserPlus className="mr-2 h-4 w-4" /> Follow
            </Button>
          </div>
        )}
      </div>

      {/* Profile Info Section */}
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
            <p className="text-sm text-muted-foreground">@{user.username}</p>
          )}
          <div className="mt-2 flex space-x-4 text-sm text-muted-foreground">
            <span>
              <span className="font-semibold text-primary">
                {user.followerCount ?? 0}
              </span>{' '}
              Followers
            </span>
            <span>
              <span className="font-semibold text-primary">
                {user.followingCount ?? 0}
              </span>{' '}
              Following
            </span>
          </div>
        </div>
        <div className="flex-grow" />
      </div>

      {/* Bio Section */}
      {user.bio && (
        <Card className="mt-6">
          <CardContent className="p-4">
            <p className="text-sm whitespace-pre-wrap">{user.bio}</p>
          </CardContent>
        </Card>
      )}

      {/* Tabs for Vibes */}
      <Tabs defaultValue="vibes" className="mt-8 w-full">
        <TabsList className="grid w-full grid-cols-1 md:w-auto md:inline-flex">
          <TabsTrigger value="vibes">
            Vibes ({allPosts.length ?? 0})
          </TabsTrigger>
          {/* Likes tab might be omitted or shown as private for other users' profiles */}
        </TabsList>
        <TabsContent value="vibes">
          {allPosts && allPosts.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-4">
              {allPosts.map((post: ProfilePostItem) => (
                <ProfilePostCard key={post.id} post={post} />
              ))}
            </div>
          ) : (
            <Card className="mt-4">
              <CardContent className="pt-6 text-center text-muted-foreground">
                <p>
                  {user.name || 'This user'} hasn't posted any public vibes yet.
                </p>
              </CardContent>
            </Card>
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
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
                  </>
                ) : (
                  'Load More'
                )}
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
