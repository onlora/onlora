import { eq } from 'drizzle-orm'
import { db } from '../db' // Adjust if your db instance is exported differently
import { jams, users } from '../db/schema' // Assuming 'User' is the Drizzle type for a user

// Define User type based on schema inference
export type UserSelect = typeof users.$inferSelect

/**
 * Fetches a user by their ID.
 * @param userId - The ID of the user to fetch.
 * @returns The user object or null if not found.
 */
export async function findUserById(userId: string): Promise<UserSelect | null> {
  const result = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return result[0] || null
}

interface JamCore {
  id: string
  userId: string | null
}

/**
 * Verifies if a jam exists and if the given user is its owner.
 * @param userId - The ID of the user.
 * @param jamId - The ID of the jam.
 * @returns An object indicating if the jam exists and if the user is the owner.
 *          If the jam exists, the jam object is also returned.
 */
export async function verifyUserJamOwnership(
  userId: string,
  jamId: string,
): Promise<{
  jamExists: boolean
  isOwner: boolean
  jam?: JamCore
}> {
  if (!jamId) {
    return { jamExists: false, isOwner: false }
  }

  const result = await db
    .select({ id: jams.id, userId: jams.userId })
    .from(jams)
    .where(eq(jams.id, jamId))
    .limit(1)

  if (!result || result.length === 0) {
    return { jamExists: false, isOwner: false }
  }

  const jam = result[0]
  return { jamExists: true, isOwner: jam.userId === userId, jam }
}
