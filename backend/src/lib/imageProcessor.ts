import { eq } from 'drizzle-orm'
import { db } from '../db'
import { images } from '../db/schema'
import { uploadBufferToR2 } from './r2'

/**
 * Interface for image processing result
 */
export interface ImageProcessResult {
  imageId: string
  url: string
  r2Key?: string
  isUpdated: boolean
}

/**
 * Interface for valid cover image result
 */
export interface ValidCoverResult {
  validCoverImage: { id: string; url: string } | null
  coverImgUrl: string | null
  processedImages: ImageProcessResult[]
}

/**
 * Process a single base64 image and upload it to R2
 * @param imageId The image ID
 * @param imageUrl The image URL or base64 data
 * @returns Processing result with new URL and R2 Key (if upload successful)
 */
export async function processBase64Image(
  imageId: string,
  imageUrl: string,
): Promise<ImageProcessResult | null> {
  // If not base64 data, return the original URL
  if (!imageUrl.startsWith('data:image/')) {
    return {
      imageId,
      url: imageUrl,
      isUpdated: false,
    }
  }

  try {
    // Extract image data and MIME type
    const matches = imageUrl.match(/^data:([A-Za-z-+/]+);base64,(.+)$/)

    if (!matches || matches.length !== 3) {
      console.error(`Invalid base64 format for image ${imageId}`)
      return null
    }

    const contentType = matches[1]
    const base64Data = matches[2]
    const imageBuffer = Buffer.from(base64Data, 'base64')

    // Upload to R2
    const r2Result = await uploadBufferToR2(
      imageBuffer,
      contentType,
      `${imageId}.${contentType.split('/')[1] || 'png'}`,
    )

    if (!r2Result?.publicUrl) {
      console.error(`Failed to upload image ${imageId} to R2`)
      return null
    }

    return {
      imageId,
      url: r2Result.publicUrl,
      r2Key: r2Result.key,
      isUpdated: true,
    }
  } catch (error) {
    console.error(`Error processing base64 image ${imageId}:`, error)
    return null
  }
}

/**
 * Update image records in the database
 * @param processResults Array of processing results
 * @param visibility Image visibility
 */
export async function updateImageRecords(
  processResults: ImageProcessResult[],
  visibility?: 'public' | 'private',
): Promise<void> {
  for (const result of processResults) {
    if (result.isUpdated) {
      const updateData: { url: string; r2Key?: string; isPublic?: boolean } = {
        url: result.url,
      }

      if (result.r2Key) {
        updateData.r2Key = result.r2Key
      }

      // If visibility is specified, also update the isPublic field
      if (visibility !== undefined) {
        updateData.isPublic = visibility === 'public'
      }

      await db
        .update(images)
        .set(updateData)
        .where(eq(images.id, result.imageId))

      console.log(`Updated image ${result.imageId} with R2 URL: ${result.url}`)
    }
  }
}

/**
 * Process multiple images and find a valid cover image
 * @param imageIds Array of image IDs
 * @param visibility Visibility setting (optional)
 * @returns Processing result with valid cover image and information for all processed images
 */
export async function processImagesAndFindCover(
  imageIds: string[],
  visibility?: 'public' | 'private',
): Promise<ValidCoverResult> {
  let validCoverImage = null
  let coverImgUrl = null
  const processedImages: ImageProcessResult[] = []

  // Check each image ID
  for (const imageId of imageIds) {
    const imageRecord = await db.query.images.findFirst({
      where: eq(images.id, imageId),
      columns: { id: true, url: true },
    })

    if (!imageRecord?.url) {
      console.warn(`Image ${imageId} not found or has no URL`)
      continue
    }

    // Process the image (upload to R2 if it's base64)
    const processResult = await processBase64Image(imageId, imageRecord.url)

    if (processResult) {
      processedImages.push(processResult)

      // If we haven't found a valid cover image yet, use this one
      if (!validCoverImage) {
        validCoverImage = {
          id: imageId,
          url: processResult.url,
        }
        coverImgUrl = processResult.url
      }
    }
  }

  // Update image records in the database
  if (processedImages.length > 0) {
    await updateImageRecords(processedImages, visibility)
  }

  return {
    validCoverImage,
    coverImgUrl,
    processedImages,
  }
}
