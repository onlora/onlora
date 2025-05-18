import { createAuthClient } from 'better-auth/react'
import type { WalletClient } from 'viem'
import {
  authenticateWithLensToken,
  loginToLensAndGetIdToken,
} from './auth/lens-auth'
import { lensClient } from './lens-client'

// Create the auth client
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080',
})
// Export client and hooks
export const { useSession } = authClient

/**
 * Sign in with Lens
 *
 * This function handles the complete Lens authentication flow
 */
export async function signInWithLens(
  walletClient: WalletClient,
  lensAccountAddress: string,
) {
  try {
    // Get Lens ID token
    const idToken = await loginToLensAndGetIdToken(
      walletClient,
      lensAccountAddress,
    )

    // Authenticate with backend
    const authResult = await authenticateWithLensToken(idToken)
    return { data: authResult, error: null }
  } catch (error) {
    console.error('Failed to sign in with Lens:', error)
    return {
      data: null,
      error:
        error instanceof Error ? error.message : 'Failed to sign in with Lens',
    }
  }
}

/**
 * Sign out from both better-auth and Lens
 */
export async function signOutWithLens() {
  try {
    // 1. Try to resume Lens session and logout properly
    try {
      const resumedSession = await lensClient.resumeSession()
      if (resumedSession.isOk()) {
        // If we have a valid session, logout properly
        const sessionClient = resumedSession.value
        await sessionClient.logout()
        console.log('Successfully logged out from Lens')
      }
    } catch (lensError) {
      console.warn('Failed to properly logout from Lens:', lensError)
    }

    // 2. Use better-auth to sign out
    await authClient.signOut()

    return { success: true, error: null }
  } catch (error) {
    console.error('Failed to sign out:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to sign out',
    }
  }
}
