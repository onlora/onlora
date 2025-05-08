import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import type { FeedPost } from '@/lib/api/feedApi'
import { formatDistanceToNowStrict } from 'date-fns'
import { Eye, Heart, MessageSquare } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import type React from 'react'

interface FeedPostCardProps {
  post: FeedPost
}

const getInitials = (name?: string | null) => {
  if (!name) return '?'
  const names = name.split(' ')
  if (names.length === 1) return names[0][0]?.toUpperCase() ?? '?'
  return (names[0][0] + (names[names.length - 1][0] || '')).toUpperCase()
}

const FeedPostCard: React.FC<FeedPostCardProps> = ({ post }) => {
  const timeAgo = post.createdAt
    ? formatDistanceToNowStrict(new Date(post.createdAt), { addSuffix: true })
    : 'some time ago'

  return (
    <Card className="overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col h-full dark:border-gray-700">
      <Link href={`/posts/${post.id}`} className="block group">
        <CardContent className="p-0">
          {post.coverImg ? (
            <div className="aspect-[1/1] w-full relative overflow-hidden">
              <Image
                src={post.coverImg}
                alt={post.title || 'Feed post image'}
                fill
                sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 30vw" // Example sizes, adjust based on grid layout
                className="object-cover group-hover:scale-105 transition-transform duration-300"
              />
            </div>
          ) : (
            <div className="aspect-[1/1] w-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <span className="text-gray-400 dark:text-gray-600 text-xs">
                No Image
              </span>
            </div>
          )}
        </CardContent>
      </Link>

      <CardFooter className="p-3 mt-auto bg-white dark:bg-gray-900/50 border-t dark:border-gray-700/50">
        <div className="flex items-center space-x-2 overflow-hidden mr-2">
          <Avatar className="h-6 w-6">
            <AvatarImage
              src={post.author?.image ?? undefined}
              alt={post.author?.name ?? 'Author'}
            />
            <AvatarFallback>{getInitials(post.author?.name)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 overflow-hidden">
            <p className="text-xs font-medium truncate text-gray-700 dark:text-gray-300">
              {post.author?.name ?? 'Anonymous'}
            </p>
            {/* <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{timeAgo}</p> */}
          </div>
        </div>
        <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400 ml-auto">
          <div className="flex items-center">
            <Heart className="h-3.5 w-3.5 mr-0.5" />
            <span>{post.likeCount ?? 0}</span>
          </div>
          <div className="flex items-center">
            <MessageSquare className="h-3.5 w-3.5 mr-0.5" />
            <span>{post.commentCount ?? 0}</span>
          </div>
          {post.viewCount != null && (
            <div className="hidden sm:flex items-center">
              <Eye className="h-3.5 w-3.5 mr-0.5" />
              <span>{post.viewCount}</span>
            </div>
          )}
        </div>
      </CardFooter>
    </Card>
  )
}

export default FeedPostCard
