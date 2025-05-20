import { evmAddress } from '@lens-protocol/client'
import { fetchAccount } from '@lens-protocol/client/actions'
import type { BetterAuthPlugin, User } from 'better-auth'
import { APIError, createAuthEndpoint } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import type { JWTPayload } from 'jose'
import { jwtVerify } from 'jose'
import { createRemoteJWKSet } from 'jose'
import { z } from 'zod'
import { lensClient } from '../../../../lib/lens-client'

// Configure JWKS for Lens token verification - default to mainnet
const DEFAULT_JWKS_URI = 'https://api.lens.xyz/.well-known/jwks.json'
const TESTNET_JWKS_URI = 'https://api.testnet.lens.xyz/.well-known/jwks.json'

// Create client and JWKS locally if lens-client.ts isn't available
// Importing from PublicClient might not be available in the backend context

export interface SIWLPluginOptions {
  // Lens-specific options
  appId?: string // Optional Lens app ID to verify in the aud claim
  useTestnet?: boolean // Whether to use testnet JWKS
  placeholderEmailDomain?: string // Restored
  defaultAvatarUrl?: string // Keep name, but will map to user.image
}

interface LensDbRecord {
  id: string
  userId: string
  address: string // Changed from lensAccountId
  username?: string // Changed from lensUsername
}

// Add type for Lens account metadata
interface LensAccountMetadata {
  name?: string
  picture?: string
  bio?: string
  [key: string]: unknown
}

/**
 * Sign in with Lens (SIWL) plugin for Better Auth
 *
 * This plugin allows users to authenticate with their Lens account
 * by verifying a Lens ID token JWT and creating a local user record.
 *
 * The authentication flow is:
 * 1. Frontend obtains a Lens ID token by authenticating with Lens
 * 2. Frontend sends this token to our backend
 * 3. Backend verifies the token and extracts wallet address ('sub' claim)
 * 4. Backend queries Lens API for account info associated with the wallet
 * 5. Backend creates/updates local user record linked to the Lens account
 * 6. Backend creates a session and returns auth credentials
 */
export const siwl = (options: SIWLPluginOptions = {}): BetterAuthPlugin => {
  // Set up the JWKS endpoint based on options
  const jwksUri = options.useTestnet ? TESTNET_JWKS_URI : DEFAULT_JWKS_URI
  const lensJWKS = createRemoteJWKSet(new URL(jwksUri))
  const defaultImage =
    options.defaultAvatarUrl || 'https://example.com/default_image.png'

  // Helper function to fetch wallet's account from Lens API using the SDK
  async function fetchAccountByAddress(address: string): Promise<{
    address: string
    username?: string
    metadata?: LensAccountMetadata
  } | null> {
    try {
      const result = await fetchAccount(lensClient, {
        address: evmAddress(address),
      })

      if (result.isErr()) {
        console.error('Error fetching account from Lens API:', result.error)
        return null
      }

      // Extract account data
      const account = result.value

      if (!account) return null
      if (!account.address) {
        console.error('Account data missing address field:', account)
        return null
      }

      return {
        address: account.address,
        username: account.username?.localName,
        metadata: account.metadata as LensAccountMetadata,
      }
    } catch (error) {
      console.error('Error fetching account from Lens API:', error)
      throw error
    }
  }

  // The plugin implementation
  const plugin = {
    id: 'lens',
    schema: {
      lensAccounts: {
        fields: {
          userId: { type: 'string' },
          address: { type: 'string', unique: true },
          username: { type: 'string', unique: true, optional: true },
          metadata: { type: 'string', optional: true },
        },
      },
    },
    // Define endpoints object
    endpoints: {
      signin: createAuthEndpoint(
        '/lens/signin',
        {
          method: 'POST',
          body: z.object({
            idToken: z
              .string()
              .min(1, { message: 'ID token is required and cannot be empty' }),
          }),
        },
        async (ctx) => {
          try {
            // Access idToken directly from ctx.body, validated by Zod
            const { idToken } = ctx.body

            let payload: JWTPayload
            try {
              payload = (await jwtVerify(idToken, lensJWKS)).payload

            } catch (e) {
              throw new APIError('UNAUTHORIZED', {
                message: 'Invalid Lens ID token',
                status: 401,
              })
            }
            if (!payload.sub)
              throw new APIError('UNAUTHORIZED', {
                message: "Token missing required 'sub' (subject) claim",
                status: 401,
              })
            if (options.appId && payload.aud !== options.appId)
              throw new APIError('UNAUTHORIZED', {
                message: 'Invalid token audience (aud)',
                status: 401,
              })

            // Get the wallet address from the token - this is the main identifier
            const walletAddress = payload.sub

            // The act field would contain a delegated address in case of authorized actions
            const actorAddressObj = payload.act as { sub?: string } | undefined
            const actorAddress = actorAddressObj?.sub

            // Fetch account using the actor address if available, otherwise use the wallet address
            const addressToUse = actorAddress || walletAddress
            const lensAccount = await fetchAccountByAddress(addressToUse)

            if (!lensAccount) {
              throw new APIError('UNAUTHORIZED', {
                message: 'No Lens account found for this wallet address',
                status: 401,
              })
            }

            if (
              actorAddress &&
              actorAddress.toLowerCase() !== lensAccount.address.toLowerCase()
            ) {
              console.error(
                `Warning: Actor address (${actorAddress}) from token differs from wallet's address (${lensAccount.address})`,
              )
            }

            // Extract account address, username, and metadata
            const accountAddress = lensAccount.address
            const username = lensAccount.username
            const metadata = lensAccount.metadata

            if (!username) {
              throw new APIError('BAD_REQUEST', {
                message: 'The Lens account does not have a username',
                status: 400,
              })
            }

            // Use metadata for user fields
            const nameFromLens = metadata?.name as string | undefined
            const pictureUrlFromLens = metadata?.picture as string | undefined

            let user: User
            // print context tables
            const lensAccountData = (await ctx.context.adapter.findOne({
              model: 'lensAccounts',
              where: [
                { field: 'address', operator: 'eq', value: accountAddress },
              ],
            })) as LensDbRecord | null

            if (lensAccountData) {
              const foundUser = (await ctx.context.adapter.findOne({
                model: 'user',
                where: [
                  {
                    field: 'id',
                    operator: 'eq',
                    value: lensAccountData.userId,
                  },
                ],
              })) as User | null

              if (!foundUser) {
                console.error(
                  `User not found for Lens address ${accountAddress} with existing lensAccounts entry ${lensAccountData.id}`,
                )
                throw new APIError('INTERNAL_SERVER_ERROR', {
                  message: 'User inconsistency found.',
                  status: 500,
                })
              }

              user = foundUser
              user.name = user.name || nameFromLens || username
              user.image = user.image || pictureUrlFromLens || defaultImage
              user.email =
                user.email ||
                `${username.replace(/\W/g, '')}${Date.now()}@example.lens`
              user.emailVerified =
                typeof user.emailVerified === 'boolean'
                  ? user.emailVerified
                  : false
              user.createdAt = user.createdAt || new Date()
              user.updatedAt = user.updatedAt || new Date()
            } else {
              const userEmail = options.placeholderEmailDomain
                ? `${username}@${options.placeholderEmailDomain}`
                : `${username.replace(/\W/g, '')}${Date.now()}@example.lens`

              const createdUser = (await ctx.context.internalAdapter.createUser(
                {
                  name: nameFromLens || username,
                  email: userEmail,
                  image: pictureUrlFromLens || defaultImage,
                  emailVerified: false,
                },
              )) as User

              if (!createdUser || !createdUser.id) {
                throw new APIError('INTERNAL_SERVER_ERROR', {
                  message: 'Failed to create user.',
                  status: 500,
                })
              }

              user = createdUser
              user.createdAt = user.createdAt || new Date()
              user.updatedAt = user.updatedAt || new Date()

              // Create lensAccounts record with address, username, and metadata
              await ctx.context.adapter.create({
                model: 'lensAccounts',
                data: {
                  userId: user.id,
                  address: accountAddress,
                  username: username,
                  metadata: metadata ? JSON.stringify(metadata) : null,
                },
              })
            }

            // We need to cast the context type for these library functions
            const session = await ctx.context.internalAdapter.createSession(
              user.id,
              ctx.request,
            )

            if (!session) {
              throw new APIError('INTERNAL_SERVER_ERROR', {
                message: 'Failed to create session.',
                status: 500,
              })
            }

            if (!ctx.request) {
              throw new APIError('INTERNAL_SERVER_ERROR', {
                message: 'Request context unavailable for setting cookie',
                status: 500,
              })
            }

            // Set the session cookie with properly typed parameters
            await setSessionCookie(ctx, { session, user })

            return ctx.json(
              {
                success: true,
                message: 'Lens authentication successful',
                token: session.token,
                user: {
                  id: user.id,
                  name: user.name,
                  email: user.email,
                  image: user.image,
                  emailVerified: user.emailVerified,
                  createdAt: user.createdAt,
                  updatedAt: user.updatedAt,
                },
              },
              { status: 200 },
            )
          } catch (error: unknown) {
            if (error instanceof APIError) throw error
            console.error('Lens authentication unexpected error:', error)
            throw new APIError('INTERNAL_SERVER_ERROR', {
              message:
                error instanceof Error
                  ? error.message
                  : 'Authentication failed unexpectedly',
              status: 500,
            })
          }
        },
      ),
    },
  } as BetterAuthPlugin

  return plugin
}

// Default export
export default siwl
