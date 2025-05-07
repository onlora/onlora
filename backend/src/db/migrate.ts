import * as dotenv from 'dotenv'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

dotenv.config({
  path: '../.env.local', // Corrected path: assuming .env.local is in the backend/ directory
})

const runMigrations = async () => {
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    console.error(
      '🔴 DATABASE_URL environment variable is not set. Please create backend/.env.local with DATABASE_URL.',
    )
    process.exit(1)
  }

  try {
    console.log('🟠 Connecting to database...')
    const migrationClient = postgres(databaseUrl, { max: 1 })
    const db = drizzle(migrationClient)

    console.log('🟢 Connected to database.')
    console.log('🟠 Running migrations...')

    await migrate(db, { migrationsFolder: './src/db/migrations' })

    console.log('🟢 Migrations ran successfully!')
    await migrationClient.end()
    process.exit(0)
  } catch (error) {
    console.error('🔴 Error running migrations:', error)
    process.exit(1)
  }
}

runMigrations()
