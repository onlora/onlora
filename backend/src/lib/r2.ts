import crypto from 'node:crypto' // For generating unique file names
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import * as dotenv from 'dotenv'
import pino from 'pino'

dotenv.config({ path: '../.env.local' }) // Assuming .env.local is in backend/, relative to src/lib/

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty' }
      : undefined,
  name: 'r2-helper',
})

const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_PUBLIC_URL_BASE = process.env.R2_PUBLIC_URL_BASE

let r2Configured = true
if (
  !R2_BUCKET_NAME ||
  !R2_ACCOUNT_ID ||
  !R2_ACCESS_KEY_ID ||
  !R2_SECRET_ACCESS_KEY ||
  !R2_PUBLIC_URL_BASE
) {
  logger.error(
    'R2 environment variables are not fully configured. Pre-signed URL generation will fail. Please check R2_BUCKET_NAME, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL_BASE',
  )
  r2Configured = false
}

const R2_ENDPOINT = R2_ACCOUNT_ID
  ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  : ''

const s3Client = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID || '',
    secretAccessKey: R2_SECRET_ACCESS_KEY || '',
  },
})

interface PresignedUrlResult {
  uploadUrl: string
  publicUrl: string
  key: string
}

export const getUploadPresignedUrl = async (
  originalFileName: string,
  contentType: string,
  prefix = 'uploads/',
  expiresInSeconds = 3600,
): Promise<PresignedUrlResult | null> => {
  if (!r2Configured || !R2_BUCKET_NAME || !R2_PUBLIC_URL_BASE) {
    logger.error(
      'R2 not configured or essential variables missing. Cannot generate pre-signed URL.',
    )
    return null
  }

  try {
    const fileExtension = originalFileName.split('.').pop() || ''
    const randomFileName = `${crypto.randomBytes(16).toString('hex')}${fileExtension ? `.${fileExtension}` : ''}`
    const key = `${prefix.replace(/\/$/, '')}/${randomFileName}` // Ensure prefix doesn't end with slash, then add one

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    })

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: expiresInSeconds,
    })

    const publicUrl = `${R2_PUBLIC_URL_BASE.replace(/\/$/, '')}/${key}`

    logger.info(`Generated pre-signed URL for key: ${key}`)
    return { uploadUrl, publicUrl, key }
  } catch (error: unknown) {
    const errToLog = error instanceof Error ? error : new Error(String(error))
    logger.error({ err: errToLog }, 'Error generating pre-signed URL')
    return null
  }
}
