import type { Config } from 'drizzle-kit'

export default {
  schema: [
    './src/db/schema.ts',
    './src/db/auth-schema.ts',
    './src/db/lens-schema.ts',
  ],
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || '',
  },
  // verbose: true,
  strict: true,
} satisfies Config
