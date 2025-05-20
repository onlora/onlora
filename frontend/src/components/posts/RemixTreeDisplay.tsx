'use client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { RemixTreeNode, RemixTreeResponse } from '@/lib/api/postApi'
import { getInitials } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import {
  CornerRightDown,
  GitFork,
  Info,
  Loader2,
  ServerCrash,
} from 'lucide-react'
import Link from 'next/link'

interface RemixTreeDisplayProps {
  postId: string
  getRemixTreeFn: (postId: string) => Promise<RemixTreeResponse>
}

const RemixNodeCard: React.FC<{
  node: RemixTreeNode
  isCurrent: boolean
  isLineage?: boolean
}> = ({ node, isCurrent, isLineage }) => {
  return (
    <Card
      className={`mb-2 ${isCurrent ? 'border-primary' : ''} ${isLineage ? 'border-dashed' : ''}`}
    >
      <CardHeader className="p-3">
        <div className="flex items-center space-x-3">
          <Avatar className="h-8 w-8">
            <AvatarImage
              src={node.author?.image ?? undefined}
              alt={node.author?.name ?? 'User'}
            />
            <AvatarFallback>{getInitials(node.author?.name)}</AvatarFallback>
          </Avatar>
          <div>
            <CardTitle className="text-sm">
              <Link href={`/posts/${node.id}`} className="hover:underline">
                {node.title || 'Untitled Vibe'}
              </Link>
            </CardTitle>
            <CardDescription className="text-xs">
              By{' '}
              {node.author?.username ? (
                <Link
                  href={`/u/${node.author.username}`}
                  className="hover:underline"
                >
                  {node.author.name || node.author.username}
                </Link>
              ) : (
                node.author?.name || 'Unknown User'
              )}
              {' - '}
              {node.createdAt
                ? new Date(node.createdAt).toLocaleDateString()
                : 'Date unknown'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
    </Card>
  )
}

const RenderRemixBranch: React.FC<{
  branch: RemixTreeNode
  currentPostId: string
}> = ({ branch, currentPostId }) => {
  return (
    <li className="ml-0 list-none">
      <RemixNodeCard node={branch} isCurrent={branch.id === currentPostId} />
      {branch.remixes && branch.remixes.length > 0 && (
        <ul className="pl-6 border-l ml-4">
          {branch.remixes.map((child) => (
            <RenderRemixBranch
              key={child.id}
              branch={child}
              currentPostId={currentPostId}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

export const RemixTreeDisplay: React.FC<RemixTreeDisplayProps> = ({
  postId,
  getRemixTreeFn,
}) => {
  const { data, isLoading, isError, error } = useQuery<
    RemixTreeResponse,
    Error
  >({
    queryKey: ['remixTree', postId],
    queryFn: () => getRemixTreeFn(postId),
    enabled: !!postId,
  })

  if (isLoading) {
    return (
      <div className="flex items-center space-x-2 text-muted-foreground py-4">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading Remix History...</span>
      </div>
    )
  }

  if (isError) {
    return (
      <Alert variant="destructive" className="my-4">
        <ServerCrash className="h-4 w-4" />
        <AlertTitle>Error Loading Remix History</AlertTitle>
        <AlertDescription>
          {error?.message || 'An unknown error occurred.'}
        </AlertDescription>
      </Alert>
    )
  }

  if (!data) {
    return (
      <Alert className="my-4">
        <Info className="h-4 w-4" />
        <AlertTitle>No Remix History Found</AlertTitle>
        <AlertDescription>
          This post does not seem to have any remix history or lineage.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="mt-6">
      <h3 className="text-xl font-semibold mb-3 flex items-center">
        <GitFork className="mr-2 h-5 w-5" />
        Remix Lineage & Tree
      </h3>

      {data.lineage && data.lineage.length > 0 && (
        <div className="mb-4">
          <h4 className="text-md font-medium mb-2 text-muted-foreground">
            Inspired By:
          </h4>
          <ul className="space-y-1">
            {data.lineage.map((node) => (
              <li key={node.id} className="ml-0 list-none">
                <RemixNodeCard node={node} isCurrent={false} isLineage />
              </li>
            ))}
          </ul>
          <div className="pl-6 border-l ml-4">
            <CornerRightDown className="h-5 w-5 text-muted-foreground my-1" />
          </div>
        </div>
      )}

      <h4 className="text-md font-medium mb-2 text-muted-foreground">
        {data.lineage && data.lineage.length > 0
          ? 'Current Vibe & Its Remixes:'
          : 'Vibe & Its Remixes:'}
      </h4>
      <ul>
        <RenderRemixBranch
          branch={data.tree}
          currentPostId={data.currentPostId}
        />
      </ul>
    </div>
  )
}
