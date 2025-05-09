import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { config } from '../config'
import { db } from '../db'
import {
  accounts as accountsAuthTable,
  sessions as sessionsAuthTable,
  users as usersAuthTable,
  verifications as verificationsTable,
} from '../db/auth-schema'
import { veTxns } from '../db/schema'

if (!config.googleClientId) {
  throw new Error('Missing GOOGLE_CLIENT_ID environment variable')
}
if (!config.googleClientSecret) {
  throw new Error('Missing GOOGLE_CLIENT_SECRET environment variable')
}
if (!config.jwtSecret) {
  throw new Error('Missing JWT_SECRET environment variable')
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: usersAuthTable,
      account: accountsAuthTable,
      session: sessionsAuthTable,
      verification: verificationsTable,
    },
  }),
  socialProviders: {
    google: {
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret,
    },
    // emailAndPassword: { enabled: true }, // If we want email/password later
  },
  jwt: {
    secret: config.jwtSecret,
    options: { expiresIn: '24h' },
  },
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
              delta: 50,
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
  // Example of database hooks if needed later for custom logic on user creation:
  // databaseHooks: {
  //   user: {
  //     create: {
  //       after: async (user, ctx) => {
  //         // - Update user.vibe_energy (initial value is set by DB default)
  //         // - Create ve_txns entry for signup
  //         // This requires access to `db` (Drizzle instance) here
  //         // console.log('New user created by better-auth:', user);
  //         // await db.update(schema.users).set({ vibe_energy: 50 }).where(eq(schema.users.id, user.id));
  //         // await db.insert(schema.veTxns).values({ userId: user.id, delta: 50, reason: 'signup' });
  //       },
  //     },
  //   },
  // },
})
