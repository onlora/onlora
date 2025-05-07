import * as dotenv from 'dotenv'
import type { Config } from 'drizzle-kit'

dotenv.config({
  path: '.env.local', // Or your preferred .env file
})

export default {
  schema: ['./src/db/schema.ts', './src/db/auth-schema.ts'], // Explicitly list both schema files
  out: './src/db/migrations',
  dialect: 'postgresql', // Specify dialect as postgresql for pg driver
  dbCredentials: {
    url: process.env.DATABASE_URL || '', // Get a warning if not set, but allows drizzle-kit to run for generation
  },
  verbose: true,
  strict: true,
} satisfies Config
