import crypto from 'node:crypto' // For generating unique file names
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import pino from 'pino'
import { config } from '../config'

const logger = pino({
  level: config.logLevel,
  transport:
    config.nodeEnv !== 'production' ? { target: 'pino-pretty' } : undefined,
  name: 'r2-helper',
})

let r2Configured = true
if (
  !config.r2BucketName ||
  !config.r2AccountId ||
  !config.r2AccessKeyId ||
  !config.r2SecretAccessKey ||
  !config.r2PublicUrlBase
) {
  logger.error(
    'R2 environment variables are not fully configured. Pre-signed URL generation will fail. Please check R2_BUCKET_NAME, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL_BASE',
  )
  r2Configured = false
}

const R2_ENDPOINT = config.r2AccountId
  ? `https://${config.r2AccountId}.r2.cloudflarestorage.com`
  : ''

const s3Client = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: config.r2AccessKeyId || '',
    secretAccessKey: config.r2SecretAccessKey || '',
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
  if (!r2Configured || !config.r2BucketName || !config.r2PublicUrlBase) {
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
      Bucket: config.r2BucketName,
      Key: key,
      ContentType: contentType,
    })

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: expiresInSeconds,
    })

    const publicUrl = `${config.r2PublicUrlBase.replace(/\/$/, '')}/${key}`

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
 * @returns Promise<UploadResult | null>
 */
export const uploadBufferToR2 = async (
  buffer: Buffer,
  contentType: string,
  desiredFileName?: string,
): Promise<UploadResult | null> => {
  if (!r2Configured || !config.r2BucketName || !config.r2PublicUrlBase) {
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

    const key = fileName.replace(/^\/+/, '') // Ensure no leading slashes

    const command = new PutObjectCommand({
      Bucket: config.r2BucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: 'public-read',
    })

    const response = await s3Client.send(command)

    // Construct the public URL based on the R2_PUBLIC_URL_BASE and the key
    const publicUrl = `${config.r2PublicUrlBase.replace(/\/$/, '')}/${key}`

    logger.info(
      { key, publicUrl, eTag: response.ETag },
      'Buffer uploaded successfully to R2.',
    )
    return { publicUrl, key, eTag: response.ETag }
  } catch (error: unknown) {
    const errToLog = error instanceof Error ? error : new Error(String(error))
    logger.error({ err: errToLog }, 'Error uploading buffer to R2')
    return null
  }
}
