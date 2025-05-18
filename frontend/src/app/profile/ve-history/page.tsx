'use client'

import { SignInButton } from '@/components/auth/SignInButton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  type VeTransactionItem,
  getMyProfile,
  getMyVeHistory,
} from '@/lib/api/userApi'
import { useSession } from '@/lib/authClient'
import { cn } from '@/lib/utils'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowDown,
  ArrowUp,
  Info,
  Loader2,
  ServerCrash,
  Zap,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo } from 'react'

const VE_HISTORY_PAGE_SIZE = 20

function formatReason(reason: string | null, refId: string | null): string {
  if (!reason) return 'Unknown reason'

  return reason
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export default function VEHistoryPage() {
  const { data: session, isPending } = useSession()
  const router = useRouter()

  const isAuthenticated = useMemo(() => {
    if (isPending) return false
    return !!session?.user
  }, [isPending, session])

  useEffect(() => {
    if (!isPending && !isAuthenticated) {
      router.push('/')
    }
  }, [isAuthenticated, isPending, router])

  const {
    data: profileData,
    isLoading: isProfileLoading,
    isError: isProfileError,
  } = useQuery({
    queryKey: ['myProfile'],
    queryFn: () => getMyProfile(),
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 2,
  })

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isHistoryLoading,
    isError: isHistoryError,
    error: historyError,
  } = useInfiniteQuery({
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
    staleTime: 1000 * 60 * 2,
  })

  const isLoading = isHistoryLoading || isProfileLoading
  const isError = isHistoryError || isProfileError
  const veBalance = profileData?.user?.vibeEnergy ?? 0

  if (!isPending && !isAuthenticated) {
    return (
      <div className="container flex items-center justify-center min-h-[calc(100vh-200px)]">
        <div className="w-full max-w-md">
          <h1 className="text-2xl font-bold mb-4 text-center">
            Sign In Required
          </h1>
          <p className="text-muted-foreground mb-4 text-center">
            Please sign in to view your VE history
          </p>
          <SignInButton />
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="flex items-center justify-between mb-8 bg-card p-6 rounded-xl shadow-sm">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-12 w-24" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-4 bg-card/50 rounded-lg animate-pulse"
            >
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-6 w-14" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    const errorMessage =
      historyError instanceof Error
        ? historyError.message
        : 'An unknown error occurred'
    return (
      <div className="max-w-2xl mx-auto p-6">
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
    <div className="max-w-2xl mx-auto p-6">
      {/* VE Balance Card */}
      <div className="flex items-center justify-between mb-8 bg-card p-6 rounded-xl shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Vibe Energy</h1>
          <p className="text-sm text-muted-foreground">Transaction History</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-3 bg-green-100 dark:bg-green-900/30 rounded-xl">
          <Zap className="h-5 w-5 text-green-600 dark:text-green-400" />
          <span className="text-xl font-bold text-green-700 dark:text-green-400 tabular-nums">
            {veBalance}
          </span>
        </div>
      </div>

      {/* Transactions List */}
      {allTransactions.length === 0 ? (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>No Transactions Yet</AlertTitle>
          <AlertDescription>
            Your VE transaction history is empty. Start interacting with the
            platform to earn VE!
          </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-3">
          {allTransactions.map((tx: VeTransactionItem) => (
            <motion.div
              key={tx.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center justify-between p-4 bg-card/50 rounded-lg hover:bg-card/80 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'rounded-full p-2',
                    tx.delta >= 0
                      ? 'bg-green-100 dark:bg-green-900/30'
                      : 'bg-red-100 dark:bg-red-900/30',
                  )}
                >
                  {tx.delta >= 0 ? (
                    <ArrowUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <ArrowDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                  )}
                </div>
                <div>
                  <p className="font-medium">
                    {formatReason(tx.reason, tx.refId)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(tx.createdAt).toLocaleDateString()} ·{' '}
                    {new Date(tx.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>

              <span
                className={cn(
                  'text-base font-semibold tabular-nums',
                  tx.delta >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400',
                )}
              >
                {tx.delta >= 0 ? `+${tx.delta}` : tx.delta}
              </span>
            </motion.div>
          ))}

          {hasNextPage && (
            <div className="text-center pt-4">
              <Button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                variant="outline"
                className="w-full rounded-lg"
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading more...
                  </>
                ) : (
                  'Load More'
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
