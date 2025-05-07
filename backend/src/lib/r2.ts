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

interface UploadResult {
  publicUrl: string
  key: string // The full S3 key
  eTag?: string // ETag of the uploaded object, if available
}

/**
 * Uploads a buffer directly to Cloudflare R2.
 * @param buffer The data to upload.
 * @param contentType The MIME type of the content (e.g., 'image/png').
 * @param desiredFileName Optional: a specific file name (e.g., 'my-image.png'). If not provided, a random one is generated.
 * @param keyPrefix The prefix for the S3 key (e.g., 'uploads/user123/'). Defaults to 'general-uploads/'.
 * @returns Promise<UploadResult | null>
 */
export const uploadBufferToR2 = async (
  buffer: Buffer,
  contentType: string,
  desiredFileName?: string,
  keyPrefix = 'general-uploads/',
): Promise<UploadResult | null> => {
  if (!r2Configured || !R2_BUCKET_NAME || !R2_PUBLIC_URL_BASE) {
    logger.error(
      'R2 not configured or essential variables missing. Cannot upload buffer.',
    )
    return null
  }

  try {
    let fileName = desiredFileName
    if (!fileName) {
      const fileExtension = contentType.split('/')[1] || 'bin' // Get extension from MIME type
      fileName = `${crypto.randomBytes(16).toString('hex')}.${fileExtension}`
    }

    const key = `${keyPrefix.replace(/\/$/, '')}/${fileName}`.replace(
      /^\/+/,
      '',
    ) // Ensure no leading/double slashes

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      // ACL: 'public-read', // R2 doesn't use S3 ACLs like this; public access is via bucket settings or Cloudflare Access
    })

    const response = await s3Client.send(command)

    // Construct the public URL based on the R2_PUBLIC_URL_BASE and the key
    const publicUrl = `${R2_PUBLIC_URL_BASE.replace(/\/$/, '')}/${key}`

    logger.info(
      { key, publicUrl, eTag: response.ETag },
      'Buffer uploaded successfully to R2.',
    )
    return { publicUrl, key, eTag: response.ETag }
  } catch (error: unknown) {
    const errToLog = error instanceof Error ? error : new Error(String(error))
    logger.error({ err: errToLog, keyPrefix }, 'Error uploading buffer to R2')
    return null
  }
}
