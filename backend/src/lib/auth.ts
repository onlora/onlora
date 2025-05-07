import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from '../db'
import { accounts, sessions, users, verifications } from '../db/auth-schema'

// Check if the required environment variables are set
if (!process.env.GOOGLE_CLIENT_ID) {
  throw new Error('Missing GOOGLE_CLIENT_ID environment variable')
}
if (!process.env.GOOGLE_CLIENT_SECRET) {
  throw new Error('Missing GOOGLE_CLIENT_SECRET environment variable')
}
if (!process.env.JWT_SECRET) {
  throw new Error('Missing JWT_SECRET environment variable')
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg', // Specify PostgreSQL
    schema: {
      user: users,
      account: accounts,
      session: sessions,
      verificationToken: verifications,
    },
  }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
    // emailAndPassword: { enabled: true }, // If we want email/password later
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    options: { expiresIn: '24h' }, // As per mvp_tech_spec.md (JWT HS256, 24h)
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
