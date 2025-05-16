'use client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
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

export default function VeHistoryPageContent() {
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

  // Fetch user profile to get vibeEnergy
  const {
    data: profileData,
    isLoading: isProfileLoading,
    isError: isProfileError,
  } = useQuery({
    queryKey: ['myProfile'],
    queryFn: () => getMyProfile(),
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 2, // Cache for 2 minutes
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
    staleTime: 1000 * 60 * 2, // Cache for 2 minutes
  })

  const isLoading = isHistoryLoading || isProfileLoading
  const isError = isHistoryError || isProfileError
  const veBalance = profileData?.user?.vibeEnergy ?? 0

  if (isAuthLoading) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <div className="flex justify-center items-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
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
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <div className="mb-8 flex items-center">
          <h1 className="text-2xl font-medium mr-auto">Vibe Energy</h1>
          <Skeleton className="h-10 w-20" />
        </div>

        <Separator className="mb-6" />

        <div className="space-y-3 mb-8">
          {Array.from({ length: 5 }).map(() => (
            <div
              key={`skeleton-${Math.random().toString(36).substring(2, 9)}`}
              className="flex justify-between items-center px-3 py-3 border-b"
            >
              <div className="space-y-1">
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
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-medium mb-6">Vibe Energy</h1>
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
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <div className="flex items-center mb-3">
        <h1 className="text-2xl font-medium mr-auto">Vibe Energy</h1>

        {/* Simple Lightning Energy Indicator */}
        <div className="flex items-center space-x-2 px-3 py-2 bg-green-100 rounded-xl shadow-sm">
          <Zap className="relative z-10 h-5 w-5 text-green-600 rounded-2xl" />
          <span className="font-semibold text-green-700  tabular-nums">
            {veBalance}
          </span>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Track your Vibe Energy earnings and spending
      </p>

      <Separator className="mb-6" />

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
        <div className="mb-8">
          {allTransactions.map((tx: VeTransactionItem, index) => (
            <motion.div
              key={tx.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="flex items-center justify-between py-3 px-2 border-b last:border-0"
            >
              <div>
                <div className="flex items-center">
                  {tx.delta >= 0 ? (
                    <div className="text-green-600 mr-1.5">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </div>
                  ) : (
                    <div className="text-red-600 mr-1.5">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </div>
                  )}
                  <span className="font-medium text-sm">
                    {formatReason(tx.reason, tx.refId)}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground ml-5">
                  {new Date(tx.createdAt).toLocaleDateString()} ·{' '}
                  {new Date(tx.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              <span
                className={cn(
                  'text-sm font-medium tabular-nums',
                  tx.delta >= 0
                    ? 'text-green-600 dark:text-green-500'
                    : 'text-red-600 dark:text-red-500',
                )}
              >
                {tx.delta >= 0 ? `+${tx.delta}` : tx.delta}
              </span>
            </motion.div>
          ))}
        </div>
      )}

      {hasNextPage && (
        <div className="text-center">
          <Button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            variant="outline"
            size="sm"
            className="rounded-lg"
          >
            {isFetchingNextPage ? (
              <>
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                Loading
              </>
            ) : (
              'Load More'
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
