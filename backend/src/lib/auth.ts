import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { config } from '../config'
import { INITIAL_VE_BALANCE } from '../config/constants'
import { db } from '../db'
import {
  accounts as accountsAuthTable,
  sessions as sessionsAuthTable,
  users as usersAuthTable,
  verifications as verificationsTable,
} from '../db/auth-schema'
import { lensAccounts } from '../db/lens-schema'
import { veTxns } from '../db/schema'
import { siwl } from './better-auth/plugins/siwl'

if (!config.googleClientId) {
  throw new Error('Missing GOOGLE_CLIENT_ID environment variable')
}
if (!config.googleClientSecret) {
  throw new Error('Missing GOOGLE_CLIENT_SECRET environment variable')
}

// Define the site URL based on environment
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: usersAuthTable,
      account: accountsAuthTable,
      session: sessionsAuthTable,
      verification: verificationsTable,
      lensAccounts: lensAccounts,
    },
  }),
  socialProviders: {
    google: {
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret,
    },
  },
  plugins: [
    siwl({
      // useTestnet: process.env.NODE_ENV === 'development',
      // appId: config.lensAppId,
    }),
  ],
  trustedOrigins: ['http://localhost:3000', 'https://api.onlora.ai'],
  databaseHooks: {
    user: {
      create: {
        after: async (createdUser, ctx) => {
          // `createdUser` is the user object just created by better-auth.
          // It should have at least `id`, `email`, `name`.
          // Our `users` table has a default for `vibe_energy`,
          // so no explicit update needed for that unless defaults aren't firing as expected.
          try {
            // Create a VE transaction for signup bonus
            // Ensure createdUser.id is a string as expected by our schema if it is text('id')
            const userId = String(createdUser.id)

            await db.insert(veTxns).values({
              userId: userId,
              delta: INITIAL_VE_BALANCE,
              reason: 'signup',
              // ref_id might be null or point to the user_id itself if appropriate
            })
            console.log(
              `Successfully processed post-user-creation hook for ${userId}`,
            )
          } catch (error) {
            console.error(
              `Error in user.create.after hook for user ID ${createdUser.id}:`,
              error,
            )
            // Decide if this error should throw and potentially roll back the user creation
            // or just be logged. For now, logging.
          }
        },
      },
      // We might also need an 'update' hook if user profile data from provider needs mapping to our custom fields
    },
  },
  advanced: {
    cookiePrefix: 'onlora',
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      secure: process.env.NODE_ENV === 'production',
      domain:
        process.env.NODE_ENV === 'production' ? '.onlora.ai' : 'localhost',
      path: '/',
    },
  },
})
