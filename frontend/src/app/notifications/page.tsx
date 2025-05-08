'use client'

import ProtectedPage from '@/components/auth/ProtectedPage'
import { NotificationItemComponent } from '@/components/notifications/NotificationItemComponent' // Import shared component
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { CheckCheck, Loader2 } from 'lucide-react'
import React from 'react' // Import React for Fragment
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
    { success: boolean; message: string; updatedCount: number },
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
      <div className="container mx-auto max-w-3xl py-8">
        <h1 className="text-3xl font-bold mb-6">Notifications</h1>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>All Notifications</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              disabled={unreadCount === 0 || markAllReadMutation.isPending}
              aria-label="Mark all notifications as read"
            >
              {markAllReadMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCheck className="mr-2 h-4 w-4" />
              )}
              Mark all as read ({unreadCount})
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading && (
              <div className="p-6">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={`skeleton-notification-${i}`}
                    className="flex items-start space-x-3 p-4 border-b last:border-b-0"
                  >
                    <Skeleton className="h-9 w-9 mt-0.5 rounded-full flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {error && (
              <div className="p-6 text-center text-destructive">
                Failed to load notifications: {error.message}
              </div>
            )}
            {!isLoading && !error && allNotifications.length === 0 && (
              <div className="p-6 text-center text-muted-foreground">
                You have no notifications.
              </div>
            )}
            {!isLoading && !error && allNotifications.length > 0 && (
              <React.Fragment>
                {allNotifications.map((notification) => (
                  <NotificationItemComponent
                    key={notification.id}
                    notification={notification}
                    queryKeyToUpdate="myNotificationsPage"
                  />
                ))}
              </React.Fragment>
            )}
          </CardContent>
        </Card>
        {hasNextPage && (
          <div className="mt-6 text-center">
            <Button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              variant="outline"
            >
              {isFetchingNextPage && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Load More Notifications
            </Button>
          </div>
        )}
      </div>
    </ProtectedPage>
  )
}
