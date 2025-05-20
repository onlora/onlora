import { signMessageWith } from '@lens-protocol/client/viem'
import type { WalletClient } from 'viem'
import { authClient } from '../authClient'
import { ONLORA_LENS_APP_ID, lensClient } from '../lens-client'

/**
 * Login to Lens and get an ID token for authentication
 *
 * This function handles the Lens authentication flow:
 * 1. Connect to Lens using the wallet client
 * 2. Sign a message to prove wallet ownership
 * 3. Get the Lens credentials with ID token
 * 4. Authenticate with the backend using the Lens ID token
 *
 * @param walletClient The connected wallet client
 * @param lensAccountAddress Optional specific Lens account address
 * @returns The authentication result with user data
 */
export async function loginToLensAndGetIdToken(
  walletClient: WalletClient,
  lensAccountAddress: string,
): Promise<string> {
  if (!walletClient.account) {
    throw new Error('No account available')
  }

  console.log('lensAccountAddress', lensAccountAddress)
  console.log('walletClient.account.address', walletClient.account.address)
  const loginResult = await lensClient.login({
    accountOwner: {
      account: lensAccountAddress,
      app: ONLORA_LENS_APP_ID,
      owner: walletClient.account.address,
    },
    signMessage: signMessageWith(walletClient),
  })

  console.log('loginResult', loginResult)

  if (loginResult.isErr()) {
    throw new Error(loginResult.error.message || 'Failed to login')
  }

  const sessionClient = loginResult.value
  const credentialsResult = sessionClient.getCredentials()

  if (credentialsResult.isErr()) {
    throw new Error(
      credentialsResult.error.message || 'Failed to get credentials',
    )
  }

  const credentials = credentialsResult.value
  if (!credentials) {
    throw new Error('Could not get credentials')
  }

  return credentials.idToken
}

/**
 * Authenticate with the backend using a Lens ID token
 *
 * This function uses direct fetch to ensure correct request format
 *
 * @param idToken The Lens ID token to authenticate with
 * @returns The authentication result containing user data
 */
export async function authenticateWithLensToken(idToken: string) {
  // Use direct fetch to ensure correct request format
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
  const url = `${backendUrl}/api/auth/lens/signin`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ idToken }),
      credentials: 'include', // Important for cookies
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Auth API error:', response.status, errorText)
      throw new Error(errorText || `API error: ${response.status}`)
    }

    const data = await response.json()

    // Explicitly refresh the session state to ensure better-auth is aware of the new session
    try {
      await authClient.getSession()
    } catch (sessionError) {
      console.warn(
        'Failed to refresh session, but auth was successful:',
        sessionError,
      )
    }

    return data
  } catch (error) {
    console.error('Failed to authenticate:', error)
    throw error
  }
}
