'use client'

import ProtectedPage from '@/components/auth/ProtectedPage'
import { NotificationItemComponent } from '@/components/notifications/NotificationItemComponent'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  type NotificationsPage,
  getMyNotifications,
  markAllNotificationsAsRead,
} from '@/lib/api/userApi'
import { useSession } from '@/lib/authClient'
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { BellOff, CheckCheck, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const NOTIFICATIONS_PER_PAGE = 20

export default function NotificationsDisplayPage() {
  const { data: session } = useSession()
  const queryClient = useQueryClient()
  const userId = session?.user?.id

  const {
    data: notificationsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useInfiniteQuery<
    NotificationsPage,
    Error,
    InfiniteData<NotificationsPage>,
    (string | undefined)[] | [string, string | undefined],
    number
  >({
    queryKey: ['myNotificationsPage', userId],
    queryFn: ({ pageParam = 0 }) =>
      getMyNotifications({ limit: NOTIFICATIONS_PER_PAGE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.pageInfo.hasNextPage ? lastPage.pageInfo.nextOffset : undefined,
    enabled: !!userId,
  })

  const allNotifications =
    notificationsData?.pages.flatMap((page) => page.items) ?? []
  const unreadCount = allNotifications.filter((n) => !n.isRead).length

  const markAllReadMutation = useMutation<
    { success: boolean; message?: string; error?: string },
    Error,
    void
  >({
    mutationFn: markAllNotificationsAsRead,
    onSuccess: (data) => {
      toast.success(data.message || 'All notifications marked as read.')
      queryClient.setQueryData<InfiniteData<NotificationsPage> | undefined>(
        ['myNotificationsPage', userId],
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
      queryClient.invalidateQueries({ queryKey: ['myNotifications', userId] })
    },
    onError: (_error) => {
      toast.error('Failed to mark all notifications as read.')
    },
  })

  const handleMarkAllRead = () => {
    if (unreadCount > 0) {
      markAllReadMutation.mutate()
    }
  }

  return (
    <ProtectedPage>
      <div className="container px-4 mx-auto max-w-3xl py-6 sm:py-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">
            Notifications
          </h1>

          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllRead}
              disabled={markAllReadMutation.isPending}
              aria-label="Mark all notifications as read"
              className="rounded-full bg-background hover:bg-muted border border-border/50 text-foreground flex items-center gap-1.5 px-4"
            >
              {markAllReadMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              ) : (
                <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className="text-sm font-normal">Mark all as read</span>
              {unreadCount > 0 && (
                <span className="ml-1 w-5 h-5 flex items-center justify-center text-xs bg-primary/10 text-primary rounded-full">
                  {unreadCount}
                </span>
              )}
            </Button>
          )}
        </div>

        <div className="bg-card rounded-lg overflow-hidden border border-border/30">
          {isLoading && (
            <div>
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={`skeleton-notification-item-${Date.now()}-${i}`}
                  className="flex items-start p-4 border-b border-border/20 last:border-0"
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground mr-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/5" />
                    <Skeleton className="h-3 w-2/5" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="p-8 text-center">
              <div className="rounded-full bg-muted p-3 w-12 h-12 mx-auto mb-4 flex items-center justify-center">
                <BellOff className="text-muted-foreground h-6 w-6" />
              </div>
              <p className="text-foreground font-medium mb-1">
                Could not load notifications
              </p>
              <p className="text-muted-foreground text-sm">{error.message}</p>
            </div>
          )}

          {!isLoading && !error && allNotifications.length === 0 && (
            <div className="p-10 text-center">
              <div className="rounded-full bg-muted/50 p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <BellOff className="text-muted-foreground h-8 w-8" />
              </div>
              <p className="text-foreground font-medium mb-1">
                No notifications
              </p>
              <p className="text-muted-foreground text-sm">
                When you receive notifications, they'll appear here.
              </p>
            </div>
          )}

          {!isLoading && !error && allNotifications.length > 0 && (
            <div className="divide-y divide-border/20">
              {allNotifications.map((notification) => (
                <div key={notification.id} className="relative">
                  {!notification.isRead && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    </div>
                  )}
                  <NotificationItemComponent
                    key={notification.id}
                    notification={notification}
                    queryKeyToUpdate="myNotificationsPage"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {hasNextPage && (
          <div className="mt-6 text-center">
            <Button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              variant="ghost"
              className="text-muted-foreground hover:text-foreground hover:bg-muted/50"
            >
              {isFetchingNextPage ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <span>Load more notifications</span>
              )}
            </Button>
          </div>
        )}
      </div>
    </ProtectedPage>
  )
}
