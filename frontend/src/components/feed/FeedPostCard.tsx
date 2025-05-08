import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { FeedPost } from '@/lib/api/feedApi'
import { getInitials } from '@/lib/utils'
import { formatDistanceToNowStrict } from 'date-fns'
import { Eye, Heart, MessageCircle, Repeat2 } from 'lucide-react'
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
    <div className="bg-card border rounded-lg overflow-hidden shadow-sm transition-all hover:shadow-md">
      <div className="p-4 sm:p-5">
        <div className="flex items-center space-x-3 mb-3">
          {post.author ? (
            <Link
              href={`/u/${authorUsername || post.author.id}`}
              className="flex items-center space-x-3 group"
            >
              <Avatar className="h-10 w-10 border">
                <AvatarImage src={authorImage ?? undefined} alt={authorName} />
                <AvatarFallback>{getInitials(authorName)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-semibold text-foreground group-hover:underline leading-tight">
                  {authorName}
                </p>
                {authorUsername && (
                  <p className="text-xs text-muted-foreground group-hover:underline leading-tight">
                    @{authorUsername}
                  </p>
                )}
              </div>
            </Link>
          ) : (
            <div className="flex items-center space-x-3">
              <Avatar className="h-10 w-10 border">
                <AvatarFallback>??</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-semibold text-foreground leading-tight">
                  Unknown Author
                </p>
              </div>
            </div>
          )}
          <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
            {postCreationDate}
          </span>
        </div>

        {post.coverImg && (
          <Link
            href={`/posts/${post.id}`}
            className="block mb-3 aspect-video relative rounded-md overflow-hidden border"
          >
            <Image
              src={post.coverImg}
              alt={post.title ?? 'Post image'}
              fill
              className="object-cover transition-transform duration-300 ease-in-out group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw" // Basic responsive sizes
            />
          </Link>
        )}

        <Link href={`/posts/${post.id}`} className="block">
          <h3 className="text-lg font-semibold leading-snug hover:underline mb-2">
            {post.title || 'Untitled Post'}
          </h3>
        </Link>
      </div>

      <div className="px-4 sm:px-5 pb-4">
        <div className="flex items-center justify-start space-x-4 text-xs text-muted-foreground">
          {post.likeCount !== null && (
            <div className="flex items-center" title="Likes">
              <Heart className="w-3.5 h-3.5 mr-1" />
              <span>{post.likeCount}</span>
            </div>
          )}
          {post.commentCount !== null && (
            <div className="flex items-center" title="Comments">
              <MessageCircle className="w-3.5 h-3.5 mr-1" />
              <span>{post.commentCount}</span>
            </div>
          )}
          {post.viewCount !== null && typeof post.viewCount !== 'undefined' && (
            <div className="flex items-center" title="Views">
              <Eye className="w-3.5 h-3.5 mr-1" />
              <span>{post.viewCount}</span>
            </div>
          )}
          {post.remixCount !== null &&
            typeof post.remixCount !== 'undefined' && (
              <div className="flex items-center" title="Remixes">
                <Repeat2 className="w-3.5 h-3.5 mr-1" />
                <span>{post.remixCount}</span>
              </div>
            )}
        </div>
      </div>
    </div>
  )
}

export default FeedPostCard
