import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
// We need a config file or direct access to process.env for DATABASE_URL
// Assuming a config file backend/src/config/index.ts or similar that exports it
// For now, let's try to get it directly from process.env as per other env vars

import * as authSchema from './auth-schema' // Tables for better-auth
// Import all schemas for the Drizzle instance
import * as appSchema from './schema' // Your application-specific tables

const { Pool } = pg

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  throw new Error('Missing DATABASE_URL environment variable')
}

// Create a PostgreSQL connection pool
export const pool = new Pool({
  connectionString: DATABASE_URL,
  // ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
})

// Combine all schemas for the Drizzle instance
const combinedSchema = { ...appSchema, ...authSchema }

// Create a Drizzle ORM instance with the combined schema
export const db = drizzle(pool, {
  schema: combinedSchema,
  logger: process.env.NODE_ENV !== 'production',
}) // Enable logger for dev
