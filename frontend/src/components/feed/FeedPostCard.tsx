import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import type { FeedPost } from '@/lib/api/feedApi'
import { getInitials } from '@/lib/utils'
import { formatDistanceToNowStrict } from 'date-fns'
import { Heart, MessageCircle } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import type React from 'react'

interface FeedPostCardProps {
  post: FeedPost
}

const FeedPostCard: React.FC<FeedPostCardProps> = ({ post }) => {
  const authorName = post.author?.name ?? 'Unknown Author'
  const authorUsername = post.author?.username
  const authorImage = post.author?.image

  const postCreationDate = post.createdAt
    ? formatDistanceToNowStrict(new Date(post.createdAt), { addSuffix: true })
    : ''

  return (
    <Card className="overflow-hidden rounded-xl border-none hover:shadow-sm transition-all">
      <div className="relative">
        {post.coverImg ? (
          <Link
            href={`/posts/${post.id}`}
            className="block relative overflow-hidden"
          >
            <Image
              src={post.coverImg}
              alt={post.title ?? 'Post image'}
              fill
              className="object-cover transition-transform duration-300 ease-in-out hover:scale-105"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            />
            <div className="absolute bottom-3 right-3 bg-black/30 backdrop-blur-sm text-white px-2.5 py-1.5 rounded-full text-xs flex items-center">
              <Heart className="w-3.5 h-3.5 mr-1" />
              <span className="mr-3">{post.likeCount ?? 0}</span>
              <MessageCircle className="w-3.5 h-3.5 mr-1" />
              <span>{post.commentCount ?? 0}</span>
            </div>
          </Link>
        ) : (
          <div className="bg-muted aspect-[3/4] flex items-center justify-center">
            <span className="text-muted-foreground">No Image</span>
          </div>
        )}
      </div>

      <CardContent className="pt-3 pb-2 px-3">
        <Link href={`/posts/${post.id}`} className="block">
          <h3 className="text-sm font-medium leading-tight line-clamp-2 hover:text-primary transition-colors">
            {post.title || 'Untitled Post'}
          </h3>
        </Link>

        <div className="flex items-center mt-2 pt-2 border-t border-border/50">
          {post.author ? (
            <Link
              href={`/u/${authorUsername || post.author.id}`}
              className="flex items-center group"
            >
              <Avatar className="h-6 w-6 mr-1.5 border">
                <AvatarImage src={authorImage ?? undefined} alt={authorName} />
                <AvatarFallback className="text-[9px]">
                  {getInitials(authorName)}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs text-muted-foreground truncate max-w-[100px] group-hover:text-primary transition-colors">
                {authorName}
              </span>
            </Link>
          ) : (
            <div className="flex items-center">
              <Avatar className="h-6 w-6 mr-1.5">
                <AvatarFallback className="text-[9px]">??</AvatarFallback>
              </Avatar>
              <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                Unknown
              </span>
            </div>
          )}

          <div className="ml-auto flex items-center text-xs text-muted-foreground">
            {post.likeCount !== null && post.likeCount > 0 && (
              <div className="flex items-center ml-2" title="Likes">
                <Heart className="w-3 h-3 mr-0.5 fill-current" />
                <span>{post.likeCount}</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default FeedPostCard
