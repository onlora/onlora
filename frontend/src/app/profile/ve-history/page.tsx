'use client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  type VeHistoryPage,
  type VeTransactionItem,
  getMyVeHistory,
} from '@/lib/api/userApi'
import { useSession } from '@/lib/authClient'
import { cn } from '@/lib/utils'
import { type InfiniteData, useInfiniteQuery } from '@tanstack/react-query'
import { Info, Loader2, ServerCrash } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo } from 'react'

const VE_HISTORY_PAGE_SIZE = 20

function formatReason(reason: string | null, refId: number | null): string {
  if (!reason) return 'Unknown reason'
  // Could expand this to be more descriptive based on reason codes
  return reason
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export default function VeHistoryPage() {
  const { data: session, isPending: isAuthLoading } = useSession()
  const router = useRouter()

  const isAuthenticated = useMemo(() => {
    if (isAuthLoading) return false
    return !!session?.user
  }, [isAuthLoading, session])

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push('/api/auth/signin/google?callbackUrl=/profile/ve-history')
    }
  }, [isAuthenticated, isAuthLoading, router])

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
  } = useInfiniteQuery<
    VeHistoryPage,
    Error,
    InfiniteData<VeHistoryPage, number>,
    [string],
    number
  >({
    queryKey: ['myVeHistory'],
    queryFn: async ({ pageParam = 0 }) => {
      return getMyVeHistory({
        limit: VE_HISTORY_PAGE_SIZE,
        offset: pageParam,
      })
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (!lastPage?.pageInfo) return undefined
      const { nextOffset, hasNextPage } = lastPage.pageInfo
      return hasNextPage ? nextOffset : undefined
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 2, // Cache for 2 minutes
  })

  if (isAuthLoading) {
    return (
      <div className="p-4 md:p-6">
        <h1 className="text-2xl font-semibold mb-4">VE History</h1>
        <div className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2 text-muted-foreground">
            Checking authentication...
          </p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    // router.push should have handled this, but as a fallback
    return null
  }

  if (isLoading) {
    return (
      <div className="p-4 md:p-6">
        <h1 className="text-2xl font-semibold mb-6">VE History</h1>
        <div className="space-y-3">
          {[...Array(10)].map((_, i) => (
            <div
              key={`skel-ve-${i}`}
              className="flex justify-between items-center p-3 border rounded-md"
            >
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-5 w-12" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    const errorMessage =
      error instanceof Error ? error.message : 'An unknown error occurred'
    return (
      <div className="p-4 md:p-6">
        <h1 className="text-2xl font-semibold mb-4">VE History</h1>
        <Alert variant="destructive">
          <ServerCrash className="h-4 w-4" />
          <AlertTitle>Error Loading VE History</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const allTransactions = data?.pages.flatMap((page) => page.items ?? []) ?? []

  return (
    <div className="p-4 md:p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">VE History</h1>
        <p className="text-muted-foreground">
          Track your Vibe Energy earnings and spending.
        </p>
      </header>

      {allTransactions.length === 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>No Transactions Yet</AlertTitle>
          <AlertDescription>
            Your VE transaction history is empty. Start interacting with the
            platform to earn VE!
          </AlertDescription>
        </Alert>
      )}

      {allTransactions.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Amount</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allTransactions.map((tx: VeTransactionItem) => (
                <TableRow key={tx.id}>
                  <TableCell
                    className={cn(
                      'font-medium',
                      tx.delta >= 0 ? 'text-green-600' : 'text-red-600',
                    )}
                  >
                    {tx.delta >= 0 ? `+${tx.delta}` : tx.delta} VE
                  </TableCell>
                  <TableCell>{formatReason(tx.reason, tx.refId)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {new Date(tx.createdAt).toLocaleDateString()} -{' '}
                    {new Date(tx.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {hasNextPage && (
        <div className="text-center mt-8">
          <Button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            variant="outline"
            size="lg"
          >
            {isFetchingNextPage ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading more...
              </>
            ) : (
              'Load More Transactions'
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
