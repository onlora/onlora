'use client'

import ProtectedPage from '@/components/auth/ProtectedPage'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { type VeHistoryPage, getMyVeHistory } from '@/lib/api/userApi'
import { useSession } from '@/lib/authClient'
import { type InfiniteData, useInfiniteQuery } from '@tanstack/react-query'
import { formatDistanceToNowStrict } from 'date-fns'
import { ArrowDownRight, ArrowLeft, ArrowUpRight, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const HISTORY_PER_PAGE = 25

export default function VeHistoryDisplayPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const userId = session?.user?.id

  const {
    data: historyData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useInfiniteQuery<
    VeHistoryPage,
    Error,
    InfiniteData<VeHistoryPage>,
    (string | undefined)[],
    number
  >({
    queryKey: ['myVeHistoryPage', userId],
    queryFn: ({ pageParam = 0 }) =>
      getMyVeHistory({ limit: HISTORY_PER_PAGE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.pageInfo.hasNextPage ? lastPage.pageInfo.nextOffset : undefined,
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const allTransactions = historyData?.pages.flatMap((page) => page.items) ?? []

  const formatReason = (reason: string | null): string => {
    if (!reason) return 'Unknown reason'
    return reason.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()) // Capitalize words
  }

  return (
    <ProtectedPage>
      <div className="container mx-auto max-w-3xl py-8">
        <div className="mb-6">
          <Button variant="outline" onClick={() => router.push('/profile')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Profile
          </Button>
        </div>
        <h1 className="text-3xl font-bold mb-6">Vibe Energy History</h1>
        <Card>
          <CardHeader>
            <CardTitle>Transaction Log</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading && (
              <div className="p-6 space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={`skel-ve-txn-${i}`} className="h-12 w-full" />
                ))}
              </div>
            )}
            {error && (
              <div className="p-6 text-center text-destructive">
                Failed to load history: {error.message}
              </div>
            )}
            {!isLoading && !error && allTransactions.length === 0 && (
              <div className="p-6 text-center text-muted-foreground">
                You have no Vibe Energy transactions yet.
              </div>
            )}
            {!isLoading && !error && allTransactions.length > 0 && (
              <ul className="divide-y divide-border">
                {allTransactions.map((tx) => (
                  <li
                    key={tx.id}
                    className="p-4 flex justify-between items-center"
                  >
                    <div>
                      <p className="font-medium">{formatReason(tx.reason)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNowStrict(new Date(tx.createdAt), {
                          addSuffix: true,
                        })}
                        {/* Optionally add link to refId if applicable */}
                        {tx.refId && (
                          <Link
                            href={`/posts/${tx.refId}`}
                            className="ml-2 hover:underline text-primary"
                            title={`View related post ${tx.refId}`}
                          >
                            (Ref: {tx.refId})
                          </Link>
                        )}
                      </p>
                    </div>
                    <div
                      className={`flex items-center font-semibold ${tx.delta >= 0 ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {tx.delta >= 0 ? (
                        <ArrowUpRight className="h-4 w-4 mr-1" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4 mr-1" />
                      )}
                      {tx.delta >= 0 ? `+${tx.delta}` : tx.delta}
                    </div>
                  </li>
                ))}
              </ul>
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
              Load More History
            </Button>
          </div>
        )}
      </div>
    </ProtectedPage>
  )
}
