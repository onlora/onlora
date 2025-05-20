'use client'

import { claimDailyBonus, getDailyCheckInStatus } from '@/lib/api/veApi'
import { cn } from '@/lib/utils'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  CheckCircle,
  Loader2,
  Trophy,
  XCircle,
  Zap,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from './button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog'

export function CheckInButton() {
  const queryClient = useQueryClient()
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  // Claim daily bonus mutation
  const { mutate: checkIn, isPending } = useMutation({
    mutationFn: claimDailyBonus,
    onSuccess: (data) => {
      // Show success toast
      if (data.success) {
        toast.success('Bonus claimed!', {
          description: data.message,
        })

        // Invalidate queries that depend on VE balance
        queryClient.invalidateQueries({ queryKey: ['veBalance'] })

        // Close dialog
        setIsDialogOpen(false)
      } else {
        toast.error('Claim failed', {
          description: data.message,
        })
      }
    },
    onError: (error) => {
      toast.error('Error', {
        description: 'Failed to claim daily bonus. Please try again later.',
      })
    },
  })

  const handleCheckIn = () => {
    checkIn()
  }

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 rounded-full bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
        >
          <Zap className="h-4 w-4 text-emerald-500" />
          Daily Bonus
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md border border-slate-100 shadow-md bg-white rounded-xl p-4 max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-xl font-medium text-slate-800 flex items-center gap-2">
            <Zap className="h-5 w-5 text-emerald-500" />
            Daily Bonus
          </DialogTitle>
          <DialogDescription className="text-slate-500">
            Claim your daily Vibe Energy (VE) bonus for generating images
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <CompactCheckInStatus />
        </div>

        <div className="flex justify-end pt-2">
          <Button
            onClick={handleCheckIn}
            disabled={isPending}
            className="gap-2 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm border-none"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />
                Claim Bonus
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CompactCheckInStatus() {
  // Query to get check-in status
  const { data, isLoading, error } = useQuery({
    queryKey: ['checkInStatus'],
    queryFn: async () => {
      try {
        // Use the new GET function to fetch status without claiming
        const response = await getDailyCheckInStatus()
        return response
      } catch (error) {
        console.error('Error fetching check-in status:', error)
        throw error
      }
    },
    // Don't refetch on window focus to avoid unintended claims
    refetchOnWindowFocus: false,
  })

  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-4">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 p-4 text-slate-500">
        <AlertCircle className="h-8 w-8 text-rose-300" />
        <p className="text-sm font-medium">Failed to load bonus status</p>
      </div>
    )
  }

  const {
    checkInStreak = 0,
    monthlyCheckIns = 0,
    maxMonthlyCheckIns = 20,
    claimedToday = false,
    monthlyLimitReached = false,
    streakBonus = 0,
  } = data || {}

  // Calculate the VE bonus amount based on streak
  const BASE_VE_BONUS = 50 // Base amount
  const totalVEBonus = BASE_VE_BONUS + streakBonus

  return (
    <div className="space-y-3">
      {/* Status + Reward in one card */}
      <div className="flex gap-4 rounded-xl border p-3">
        {/* Left side: Status */}
        <div className="flex flex-1 items-center gap-3">
          <div
            className={cn(
              'h-10 w-10 rounded-full flex items-center justify-center shrink-0',
              claimedToday
                ? 'bg-teal-100'
                : monthlyLimitReached
                  ? 'bg-amber-100'
                  : 'bg-emerald-100',
            )}
          >
            {claimedToday ? (
              <CheckCircle className="h-6 w-6 text-teal-500" />
            ) : monthlyLimitReached ? (
              <XCircle className="h-6 w-6 text-amber-500" />
            ) : (
              <Zap className="h-6 w-6 text-emerald-500" />
            )}
          </div>
          <div>
            <p className="font-medium text-slate-800">
              {claimedToday
                ? 'Already claimed today'
                : monthlyLimitReached
                  ? 'Monthly limit reached'
                  : 'Bonus available'}
            </p>
            <p className="text-xs text-slate-500">
              {claimedToday
                ? 'Come back tomorrow for more VE!'
                : monthlyLimitReached
                  ? `Max ${maxMonthlyCheckIns} claims reached this month`
                  : 'Claim your daily VE bonus now!'}
            </p>
          </div>
        </div>

        {/* Right side: VE amount */}
        {!monthlyLimitReached && (
          <div className="flex flex-col justify-center">
            <div
              className={cn(
                'flex items-center justify-center h-10 px-3 rounded-full font-medium text-sm',
                claimedToday
                  ? 'bg-teal-100 text-teal-600'
                  : 'bg-emerald-100 text-emerald-600',
              )}
            >
              +{totalVEBonus} VE
            </div>
          </div>
        )}
      </div>

      {/* Combined Streak and Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Streak Card */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
          <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <Trophy className="h-5 w-5 text-amber-500" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1 flex-wrap">
              <span className="font-medium text-slate-800">
                {checkInStreak} day streak
              </span>
              {streakBonus > 0 && (
                <span className="text-xs text-emerald-500">
                  +{streakBonus} VE
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 mt-1">
              <div className="h-1.5 bg-slate-200 rounded-full flex-1">
                <div
                  className="h-1.5 bg-emerald-500 rounded-full"
                  style={{
                    width: `${Math.min((checkInStreak % 5) * 20, 100)}%`,
                  }}
                />
              </div>
              <span className="text-xs whitespace-nowrap text-slate-500">
                +1 in {5 - (checkInStreak % 5)}d
              </span>
            </div>
          </div>
        </div>

        {/* Reward Breakdown Card */}
        {!monthlyLimitReached && (
          <div className="rounded-xl bg-white border border-slate-200 p-3">
            <p className="text-xs font-medium text-slate-500 mb-2">
              {claimedToday ? "Today's Reward" : 'Reward Breakdown'}
            </p>
            <div className="grid grid-cols-2 gap-1 text-sm">
              <span className="text-slate-500">Base</span>
              <span className="text-right font-medium text-slate-700">
                +{BASE_VE_BONUS} VE
              </span>

              <span className="text-slate-500">Streak</span>
              <span className="text-right font-medium text-slate-700">
                +{streakBonus} VE
              </span>

              <span className="font-medium text-slate-700 mt-1 pt-1 border-t border-slate-100">
                Total
              </span>
              <span className="text-right font-medium text-emerald-600 mt-1 pt-1 border-t border-slate-100">
                +{totalVEBonus} VE
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Monthly Progress - More compact */}
      <div className="rounded-xl bg-white border border-slate-200 p-3">
        <div className="flex justify-between items-center mb-2">
          <p className="text-xs font-medium text-slate-700">Monthly Progress</p>
          <div className="px-2 py-0.5 rounded-full bg-emerald-50 text-xs font-medium text-emerald-600">
            {monthlyCheckIns}/{maxMonthlyCheckIns}
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: maxMonthlyCheckIns }, (_, i) => i + 1).map(
            (day) => (
              <div
                key={day}
                className={cn(
                  'aspect-square flex items-center justify-center rounded-full text-xs transition-all',
                  day <= monthlyCheckIns
                    ? 'bg-emerald-500 text-white'
                    : day === monthlyCheckIns + 1 &&
                        !claimedToday &&
                        !monthlyLimitReached
                      ? 'border border-emerald-200 text-emerald-600 animate-pulse'
                      : 'bg-slate-100 text-slate-400',
                )}
              >
                {day}
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  )
}
