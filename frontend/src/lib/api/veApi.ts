import { type ApiError, apiClient } from './apiClient'

export interface DailyBonusClaimResponse {
  success: boolean
  message: string
  newVeBalance?: number // VE balance after a successful claim. Sent by POST on new claim.
  claimedToday?: boolean // True if the bonus is claimed for the current day.
  checkInStreak?: number
  monthlyCheckIns?: number
  maxMonthlyCheckIns?: number
  streakBonus?: number // Bonus VE amount from the streak.
  monthlyLimitReached?: boolean
}

/**
 * Attempts to claim the daily login Vibe Energy bonus for the authenticated user.
 */
export const claimDailyBonus = async (): Promise<DailyBonusClaimResponse> => {
  try {
    return await apiClient<DailyBonusClaimResponse>('/ve/daily-check-in', {
      method: 'POST',
      // No body needed for this request
      credentials: 'include',
    })
  } catch (error) {
    // Handle cases where the error might not be in the expected ApiError format
    // but apiClient should standardize it.
    // For now, rethrow or return a generic error structure if needed.
    // The useMutation hook will catch this.
    console.error('Error in claimDailyBonus API call:', error)
    // Ensure a compatible error structure if not using useMutation's error handling directly elsewhere
    const apiError = error as ApiError
    return {
      success: false,
      message:
        apiError.message ||
        'Failed to claim daily bonus due to an unknown error.',
      claimedToday: false, // Or based on specific error codes if available
    }
  }
}

/**
 * Fetches the daily check-in status for the authenticated user.
 */
export const getDailyCheckInStatus =
  async (): Promise<DailyBonusClaimResponse> => {
    try {
      return await apiClient<DailyBonusClaimResponse>(
        '/ve/daily-check-in-status',
        {
          method: 'GET',
          credentials: 'include',
        },
      )
    } catch (error) {
      console.error('Error in getDailyCheckInStatus API call:', error)
      const apiError = error as ApiError
      return {
        success: false,
        message:
          apiError.message ||
          'Failed to fetch daily bonus status due to an unknown error.',
        // Default values for status fields, assuming failure means status unknown/not claimed
        claimedToday: false,
        checkInStreak: 0,
        monthlyCheckIns: 0,
        maxMonthlyCheckIns: 20, // Or fetch from a config if it varies
        streakBonus: 0,
        monthlyLimitReached: false,
      }
    }
  }

export interface VeCostResponse {
  cost: number
  error?: string // To accommodate error responses from the API
}

/**
 * Fetches the Vibe Energy cost for a specific action and model.
 */
export const getActionVeCost = async (
  actionType: string,
  modelId?: string,
): Promise<VeCostResponse> => {
  const queryParams = new URLSearchParams({ actionType })
  if (modelId) {
    queryParams.append('modelId', modelId)
  }
  // Assuming the endpoint is mounted at /api/ve/cost
  try {
    return await apiClient<VeCostResponse>(
      `/ve/cost?${queryParams.toString()}`,
      {
        method: 'GET',
        credentials: 'include', // Include if your endpoint requires authentication
      },
    )
  } catch (error) {
    console.error('Error in getActionVeCost API call:', error)
    const apiError = error as ApiError
    // Return an error structure compatible with VeCostResponse
    return {
      cost: -1, // Indicate error or indeterminate cost
      error:
        apiError.message || 'Failed to fetch VE cost due to an unknown error.',
    }
  }
}
