'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  type NotificationItem,
  type NotificationsPage,
  markNotificationAsRead,
} from '@/lib/api/userApi'
import { useSession } from '@/lib/authClient'
import { getInitials } from '@/lib/utils'
import {
  type InfiniteData,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { formatDistanceToNowStrict } from 'date-fns'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

export function NotificationItemComponent({
  notification,
  queryKeyToUpdate = 'myNotifications', // Default to header's query key, can be overridden
}: {
  notification: NotificationItem
  queryKeyToUpdate?: 'myNotifications' | 'myNotificationsPage'
}) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const userId = useSession().data?.user?.id

  const markAsReadMutation = useMutation<
    { success: boolean; message: string },
    Error,
    number // notificationId
  >({
    mutationFn: markNotificationAsRead,
    onSuccess: (_data, notificationId) => {
      // Update the specified query key (for header popover or full page)
      queryClient.setQueryData<InfiniteData<NotificationsPage> | undefined>(
        [queryKeyToUpdate, userId],
        (oldData) => {
          if (!oldData) return oldData
          return {
            ...oldData,
            pages: oldData.pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                item.id === notificationId ? { ...item, isRead: true } : item,
              ),
            })),
          }
        },
      )
      // If updating the page, also invalidate the header's query key
      if (queryKeyToUpdate === 'myNotificationsPage') {
        queryClient.invalidateQueries({ queryKey: ['myNotifications', userId] })
      }
      // If updating the header, also invalidate the page's query key
      if (queryKeyToUpdate === 'myNotifications') {
        queryClient.invalidateQueries({
          queryKey: ['myNotificationsPage', userId],
        })
      }
    },
    onError: (_error) => {
      toast.error('Failed to mark notification as read.')
    },
  })

  const getNotificationText = (n: NotificationItem): React.ReactNode => {
    const actorLink = n.actor ? (
      <Link
        href={n.actor.username ? `/u/${n.actor.username}` : `/u/${n.actor.id}`}
        className="font-semibold hover:underline"
        onClick={(e) => e.stopPropagation()} // Prevent card click when clicking link
      >
        {n.actor.name || n.actor.id}
      </Link>
    ) : (
      'Someone'
    )
    const postLink = n.post ? (
      <Link
        href={`/posts/${n.post.id}`}
        className="font-semibold hover:underline"
        onClick={(e) => e.stopPropagation()} // Prevent card click when clicking link
      >
        {n.post.title || 'a post'}
      </Link>
    ) : (
      'a post'
    )

    switch (n.type) {
      case 'like':
        return (
          <>
            {actorLink} liked {postLink}.
          </>
        )
      case 'comment':
        return (
          <>
            {actorLink} commented on {postLink}.
          </>
        )
      case 'reply':
        return (
          <>
            {actorLink} replied to your comment on {postLink}.
          </>
        )
      case 'remix':
        return (
          <>
            {actorLink} remixed {postLink}.
          </>
        )
      case 'follow':
        return <>{actorLink} started following you.</>
      default:
        return 'New notification.'
    }
  }

  const timeAgo = notification.createdAt
    ? formatDistanceToNowStrict(new Date(notification.createdAt), {
        addSuffix: true,
      })
    : ''

  const handleClick = () => {
    if (!notification.isRead) {
      markAsReadMutation.mutate(notification.id)
    }

    // Navigate based on notification type with improved null checks
    if (notification.type === 'follow' && notification.actor) {
      if (notification.actor.username) {
        router.push(`/u/${notification.actor.username}`)
      } else if (notification.actor.id) {
        // Use actor ID if username is null
        router.push(`/u/${notification.actor.id}`)
      } else {
        toast.error('Invalid user information')
      }
    } else if (notification.postId) {
      router.push(`/posts/${notification.postId}`)
    } else if (notification.actor) {
      // Fallback to actor profile
      if (notification.actor.username) {
        router.push(`/u/${notification.actor.username}`)
      } else if (notification.actor.id) {
        router.push(`/u/${notification.actor.id}`)
      } else {
        toast.error('Invalid user information')
      }
    } else {
      // If no valid destination, show error and stay on current page
      console.error('Invalid notification destination:', notification)
      toast.error('Unable to open this notification')
    }
  }

  return (
    <button
      type="button"
      className={`w-full text-left flex items-start space-x-3 p-4 border-b last:border-b-0 hover:bg-muted/50 ${!notification.isRead ? 'bg-primary/5 font-medium' : 'text-muted-foreground'}`}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick()
        }
      }}
      aria-label={`Notification from ${notification.actor?.name || 'Someone'}: ${notification.type}`}
    >
      <Avatar className="h-9 w-9 mt-0.5 flex-shrink-0">
        <AvatarImage src={notification.actor?.image ?? undefined} />
        <AvatarFallback>
          {getInitials(
            notification.actor?.name ?? notification.actor?.username,
          )}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 space-y-0.5">
        <p className="text-sm leading-snug">
          {getNotificationText(notification)}
        </p>
        <p className="text-xs">{timeAgo}</p>
      </div>
      {!notification.isRead && (
        <div
          className="h-2.5 w-2.5 rounded-full bg-primary mt-1 flex-shrink-0"
          title="Unread"
          aria-label="Unread notification"
        />
      )}
    </button>
  )
}
