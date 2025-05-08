'use client'

import { Card, CardContent } from '@/components/ui/card'
import type { ProfilePostItem } from '@/lib/api/userApi'
import { ImageIcon } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

interface ProfilePostCardProps {
  post: ProfilePostItem
}

export const ProfilePostCard = ({ post }: ProfilePostCardProps) => (
  <Link href={`/posts/${post.id}`} className="block">
    <Card className="overflow-hidden hover:shadow-lg transition-shadow group">
      <div className="relative aspect-square w-full bg-muted overflow-hidden">
        {post.coverImg ? (
          <Image
            src={post.coverImg}
            alt={post.title || `Vibe ${post.id}`}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ImageIcon className="h-12 w-12 text-muted-foreground" />
          </div>
        )}
      </div>
      <CardContent className="p-3">
        {post.title && (
          <p className="font-semibold truncate text-sm mb-1">{post.title}</p>
        )}
        <div className="text-xs text-muted-foreground flex justify-between items-center">
          <span>Likes: {post.likeCount ?? 0}</span>
          <span>Views: {post.viewCount ?? 0}</span>
        </div>
      </CardContent>
    </Card>
  </Link>
)
