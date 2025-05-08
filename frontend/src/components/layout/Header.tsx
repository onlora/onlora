'use client'

import { NotificationItemComponent } from '@/components/notifications/NotificationItemComponent'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import {
  type NotificationItem,
  type NotificationsPage,
  getMyNotifications,
  markAllNotificationsAsRead,
} from '@/lib/api/userApi'
import { type DailyBonusClaimResponse, claimDailyBonus } from '@/lib/api/veApi'
import { authClient, useSession } from '@/lib/authClient'
import { getInitials } from '@/lib/utils'
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import {
  Bell,
  CheckCheck,
  LayoutGrid,
  LogOut,
  Search,
  User as UserIcon,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

const LAST_BONUS_ATTEMPT_KEY = 'onloraLastDailyBonusClaimAttempt'

export default function Header() {
  const { data: session, isPending: isSessionPending } = useSession()
  const user = session?.user
  const queryClient = useQueryClient()
  const userId = session?.user?.id
  const router = useRouter()
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // --- Notifications Query --- //
  const {
    data: notificationsData,
    fetchNextPage: fetchNextNotificationsPage,
    hasNextPage: hasNextNotificationsPage,
    isFetchingNextPage: isFetchingNextNotificationsPage,
    isLoading: isLoadingNotifications,
  } = useInfiniteQuery<
    NotificationsPage,
    Error,
    InfiniteData<NotificationsPage>,
    (string | undefined)[],
    number
  >({
    queryKey: ['myNotifications', userId],
    queryFn: ({ pageParam = 0 }) =>
      getMyNotifications({ limit: 7, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.pageInfo.hasNextPage ? lastPage.pageInfo.nextOffset : undefined,
    enabled: !!userId,
    staleTime: 60 * 1000,
  })

  const allNotifications =
    notificationsData?.pages.flatMap((page: NotificationsPage) => page.items) ??
    []
  const unreadCount = allNotifications.filter(
    (n: NotificationItem) => !n.isRead,
  ).length

  const markAllReadMutation = useMutation<
    { success: boolean; message: string; updatedCount: number },
    Error,
    void
  >({
    mutationFn: markAllNotificationsAsRead,
    onSuccess: (data) => {
      toast.success(data.message || 'All notifications marked as read.')
      queryClient.setQueryData<InfiniteData<NotificationsPage> | undefined>(
        ['myNotifications', userId],
        (oldData) => {
          if (!oldData) return oldData
          return {
            ...oldData,
            pages: oldData.pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                !item.isRead ? { ...item, isRead: true } : item,
              ),
            })),
          }
        },
      )
      queryClient.invalidateQueries({
        queryKey: ['myNotificationsPage', userId],
      })
    },
    onError: (error) => {
      toast.error('Failed to mark all notifications as read.')
      console.error('Mark all notifications read error:', error)
    },
  })

  const dailyBonusMutation = useMutation<DailyBonusClaimResponse, Error>({
    mutationFn: claimDailyBonus,
    onSuccess: (data) => {
      localStorage.setItem(
        LAST_BONUS_ATTEMPT_KEY,
        new Date().toISOString().split('T')[0],
      )
      if (data.success) {
        if (!data.alreadyClaimed && data.newVeBalance !== undefined) {
          toast.success(
            `🎉 Daily bonus claimed! (+10 VE). Current VE: ${data.newVeBalance}.`,
          )
          queryClient.invalidateQueries({ queryKey: ['myProfileWithPosts'] })
          queryClient.invalidateQueries({ queryKey: ['myProfile'] })
        } else if (data.alreadyClaimed) {
          console.log('Daily bonus was already claimed today per backend.')
        } else {
          toast.info(data.message)
        }
      } else if (!data.success && data.message) {
        toast.error(data.message)
      }
    },
    onError: (error) => {
      toast.error(`Failed to check daily bonus: ${error.message}`)
    },
  })

  useEffect(() => {
    if (user && !isSessionPending) {
      const todayStr = new Date().toISOString().split('T')[0]
      const lastAttemptDate = localStorage.getItem(LAST_BONUS_ATTEMPT_KEY)

      if (lastAttemptDate !== todayStr) {
        console.log('Attempting to claim daily bonus...')
        dailyBonusMutation.mutate()
      }
    }
  }, [user, isSessionPending, dailyBonusMutation])

  const handleGoogleSignIn = async () => {
    try {
      await authClient.signIn.social({ provider: 'google' })
    } catch (error) {
      console.error('Google Sign-In failed:', error)
    }
  }

  const handleSignOut = async () => {
    try {
      await authClient.signOut()
    } catch (error) {
      console.error('Sign Out failed:', error)
    }
  }

  const handleNotificationItemClick = () => {
    // This function can be passed to NotificationItemComponent if we want to close the popover on item click
    // For now, the component itself handles navigation and marking as read.
    // If closing popover is desired: setPopoverOpen(false)
  }

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
      setSearchQuery('') // Clear input after search
    }
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-2xl items-center">
        <Link href="/" className="mr-6 flex items-center space-x-2">
          <span className="font-bold sm:inline-block">onlora</span>
        </Link>
        <nav className="flex flex-1 items-center space-x-6 text-sm font-medium" />

        <div className="flex-1 flex justify-center px-4">
          <form
            onSubmit={handleSearchSubmit}
            className="w-full max-w-sm relative"
          >
            <Input
              type="search"
              placeholder="Search Vibes and Users..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          </form>
        </div>

        <div className="flex flex-1 items-center justify-end space-x-4">
          {isSessionPending ? (
            <Skeleton className="h-8 w-20" />
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-8 w-8 rounded-full"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage
                      src={user.image ?? undefined}
                      alt={user.name ?? user.email ?? 'User'}
                    />
                    <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {user.name}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile">
                    <UserIcon className="mr-2 h-4 w-4" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/gallery">
                    <LayoutGrid className="mr-2 h-4 w-4" />
                    My Gallery
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button onClick={handleGoogleSignIn} variant="outline" size="sm">
              Sign In with Google
            </Button>
          )}

          {session?.user && (
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative ml-2">
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-0 right-0 block h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="end">
                <div className="p-4 font-medium border-b flex justify-between items-center">
                  <span>Notifications</span>
                  <Link
                    href="/notifications"
                    className="text-sm text-primary hover:underline"
                    onClick={() => setPopoverOpen(false)}
                  >
                    View all
                  </Link>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {isLoadingNotifications && (
                    <div className="p-4 text-sm text-muted-foreground">
                      Loading...
                    </div>
                  )}
                  {!isLoadingNotifications && allNotifications.length === 0 && (
                    <div className="p-4 text-sm text-muted-foreground">
                      No new notifications.
                    </div>
                  )}
                  {allNotifications.map((notification: NotificationItem) => (
                    <NotificationItemComponent
                      key={notification.id}
                      notification={notification}
                      queryKeyToUpdate="myNotifications"
                    />
                  ))}
                  {hasNextNotificationsPage && (
                    <div className="p-2 text-center">
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => fetchNextNotificationsPage()}
                        disabled={isFetchingNextNotificationsPage}
                      >
                        {isFetchingNextNotificationsPage
                          ? 'Loading...'
                          : 'Load More'}
                      </Button>
                    </div>
                  )}
                </div>
                {allNotifications.length > 0 && (
                  <div className="p-2 border-t text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground hover:text-primary disabled:opacity-50 w-full"
                      onClick={() => {
                        markAllReadMutation.mutate()
                      }}
                      disabled={
                        unreadCount === 0 || markAllReadMutation.isPending
                      }
                    >
                      <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
                      Mark all as read ({unreadCount})
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
    </header>
  )
}
