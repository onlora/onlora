import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import type { FeedPost } from '@/lib/api/feedApi'
import { getInitials } from '@/lib/utils'
import { Heart, Play } from 'lucide-react'
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

  // Determine if this is likely a video post
  const isVideoPost = post.coverImg?.includes('video')

  return (
    <Card className="overflow-hidden border-none bg-transparent shadow-none hover:bg-white/50 transition-all duration-200 rounded-lg group flex flex-col gap-1 py-0">
      <div className="relative w-full">
        {post.coverImg ? (
          <Link
            href={`/posts/${post.id}`}
            className="block relative overflow-hidden rounded-2xl"
          >
            <div className="relative w-full">
              <Image
                src={post.coverImg}
                alt={post.title ?? 'Post image'}
                width={300}
                height={300}
                className="object-cover transition-transform duration-300 ease-in-out group-hover:scale-[1.02] w-full"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                style={{ width: '100%', height: 'auto', display: 'block' }}
                unoptimized
              />

              {/* Video play button overlay if it's a video */}
              {isVideoPost && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="rounded-full bg-black/30 backdrop-blur-sm p-2">
                    <Play className="w-5 h-5 text-white" />
                  </div>
                </div>
              )}

              {/* Very subtle gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </Link>
        ) : (
          <div className="bg-gray-100 rounded-xl flex items-center justify-center h-[180px]">
            <span className="text-muted-foreground text-xs">No Image</span>
          </div>
        )}
      </div>

      <CardContent className="pt-3 pb-2 px-1">
        <Link href={`/posts/${post.id}`}>
          <h3 className="text-xs sm:text-sm font-medium leading-tight line-clamp-2 group-hover:text-primary transition-colors">
            {post.title || 'Untitled Post'}
          </h3>
        </Link>

        <div className="flex items-center justify-between mt-2">
          {post.author ? (
            <Link
              href={`/u/${authorUsername || post.author.id}`}
              className="flex items-center group"
            >
              <Avatar className="h-5 w-5 mr-1.5 border">
                <AvatarImage src={authorImage ?? undefined} alt={authorName} />
                <AvatarFallback className="text-[8px]">
                  {getInitials(authorName)}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs text-muted-foreground truncate max-w-[80px] group-hover:text-primary transition-colors">
                {authorName}
              </span>
            </Link>
          ) : (
            <div className="flex items-center">
              <Avatar className="h-5 w-5 mr-1.5 border">
                <AvatarFallback className="text-[8px]">??</AvatarFallback>
              </Avatar>
              <span className="text-xs text-muted-foreground truncate max-w-[80px]">
                Unknown
              </span>
            </div>
          )}

          <div className="flex items-center text-xs text-muted-foreground">
            <div className="flex items-center gap-1" title="Likes">
              <Heart className="w-4 h-4" />
              <span>{post.likeCount ?? 0}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default FeedPostCard
