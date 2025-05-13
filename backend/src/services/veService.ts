import { eq, sql } from 'drizzle-orm'
import pino from 'pino'
import { db } from '../db'
import { users as usersTable, veTxns } from '../db/schema'
import { findUserById } from '../lib/dbUtils' // Assuming dbUtils.ts is in lib

const logger = pino({ name: 'veService' })

export interface VEDeductionResult {
  success: boolean
  newVE?: number
  message?: string
  statusCode?: number
  currentVE?: number // For cases like insufficient VE
  requiredVE?: number // For cases like insufficient VE
}

/**
 * Checks, deducts Vibe Energy, and logs the transaction.
 * @param userId The ID of the user.
 * @param amountToDeduct The amount of VE to deduct (should be positive).
 * @param reason The reason for the VE transaction.
 * @param refId A reference ID for the transaction (e.g., jamId, postId).
 * @returns A promise that resolves to a VEDeductionResult.
 */
export async function deductVibeEnergy(
  userId: string,
  amountToDeduct: number,
  reason: string,
  refId: string, // Changed to string to support UUID format
): Promise<VEDeductionResult> {
  if (amountToDeduct <= 0) {
    logger.warn(
      { userId, amountToDeduct },
      'Attempted to deduct zero or negative VE.',
    )
    return {
      success: false,
      message: 'Deduction amount must be positive.',
      statusCode: 400,
    }
  }

  try {
    // 1. Check current VE
    const user = await findUserById(userId)
    if (!user) {
      logger.error({ userId }, 'User not found for VE deduction.')
      return { success: false, message: 'User not found.', statusCode: 404 }
    }

    const currentVE = user.vibe_energy ?? 0 // Default to 0 if null
    if (currentVE < amountToDeduct) {
      logger.warn(
        { userId, currentVE, amountToDeduct },
        'Insufficient VE for deduction.',
      )
      return {
        success: false,
        message: 'Insufficient Vibe Energy.',
        statusCode: 402,
        currentVE,
        requiredVE: amountToDeduct,
      }
    }

    // 2. Atomically deduct VE
    const updateResult = await db
      .update(usersTable)
      .set({
        vibe_energy: sql`${usersTable.vibe_energy} - ${amountToDeduct}`,
      })
      .where(eq(usersTable.id, userId))
      .returning({ vibeEnergy: usersTable.vibe_energy })

    if (
      !updateResult ||
      updateResult.length === 0 ||
      updateResult[0].vibeEnergy === undefined ||
      updateResult[0].vibeEnergy === null
    ) {
      logger.error(
        { userId, amountToDeduct },
        'Failed to update VE in database.',
      )
      // This is a critical error, VE might not have been deducted.
      return {
        success: false,
        message: 'Error processing Vibe Energy update.',
        statusCode: 500,
      }
    }

    const newVE = updateResult[0].vibeEnergy
    logger.info(
      { userId, oldVE: currentVE, newVE, amountDeducted: amountToDeduct },
      'VE deducted successfully.',
    )

    // 3. Record VE transaction
    try {
      await db.insert(veTxns).values({
        userId,
        delta: -amountToDeduct, // Store as negative for deduction
        reason,
        refId, // Now a string (UUID format)
      })
      logger.info(
        { userId, amount: -amountToDeduct, reason, refId },
        'VE transaction recorded.',
      )
    } catch (txnError) {
      logger.error(
        { err: txnError, userId, amountToDeduct, reason, refId },
        'Failed to record VE transaction. VE was deducted but transaction log failed.',
      )
      // This is a critical situation: VE was deducted, but the record is missing.
      // Depending on business logic, might need a compensating action or alert.
      // For now, the main operation is considered successful regarding VE deduction.
    }

    return { success: true, newVE }
  } catch (error) {
    logger.error(
      { err: error, userId, amountToDeduct },
      'Unexpected error during VE deduction process.',
    )
    return {
      success: false,
      message: 'Internal server error during Vibe Energy processing.',
      statusCode: 500,
    }
  }
}
