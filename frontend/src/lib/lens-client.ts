import {
  PublicClient,
  type SessionClient,
  mainnet,
} from '@lens-protocol/client'
import { currentSession } from '@lens-protocol/client/actions'

// Create Lens client instance with persistent storage
export const lensClient = PublicClient.create({
  environment: mainnet,
  // Use localStorage in browser environment
  storage: typeof window !== 'undefined' ? window.localStorage : undefined,
})

export const ONLORA_LENS_APP_ID = '0x46E8f06e085f68864Ef5616c9f5dEB514a7fd617'

/**
 * Get authenticated Lens session
 * @param wallet The user's wallet client
 */
export async function getSessionClient() {
  try {
    // First try to resume an existing session from storage
    const resumed = await lensClient.resumeSession()

    if (resumed.isErr()) {
      console.log('No valid Lens session found:', resumed.error.message)
      return null
    }

    return resumed.value
  } catch (error) {
    console.error('Error authenticating with Lens:', error)
    // In production, implement login sequence with:
    // const loginResult = await login(lensClient, { address, signer, appId })

    return null
  }
}

export const sessionClient = (await getSessionClient()) as SessionClient

/**
 * Check if user is logged in to Lens
 */
export async function isLensLoggedIn(): Promise<boolean> {
  try {
    // Use storage check for now (simplified)
    const session = await currentSession(sessionClient)
    return !!session
  } catch (error) {
    return false
  }
}
