import { type ApiError, apiClient } from './apiClient'

export interface DailyBonusClaimResponse {
  success: boolean
  message: string
  newVeBalance?: number
  claimedToday?: boolean // Indicates if the bonus was (already) claimed for the current day by the backend
  alreadyClaimed?: boolean // Explicitly true if the reason for no VE change is because it was already claimed
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
      alreadyClaimed: false,
    }
  }
}
