import type { MessageImageData } from './images'

/**
 * Valid HTTP status codes for API responses
 */
export type ValidHttpStatusCodes =
  | 200
  | 201
  | 202
  | 400
  | 401
  | 402
  | 403
  | 404
  | 422
  | 500
  | 503

/**
 * Successful response for image generation
 */
export interface SuccessfulGenerationClientResponse {
  id: string // UUID from database
  jamId: string // UUID from database
  role: 'ai' // Consistent with schema
  text: string | null // text can be null
  images: MessageImageData[] | null // Array of image data objects, can be null
  createdAt: string // ISO string
  // For simplicity, we can also provide top-level fields for the first image if frontend expects it:
  imageUrl?: string // primary image URL
  altText?: string // primary image alt text
}

/**
 * Generic error response
 */
export interface ErrorResponse {
  code: number
  message: string
  currentVE?: number
  requiredVE?: number
}

/**
 * Union type for all possible image generation responses
 */
export type GenerateImageClientResponse =
  | SuccessfulGenerationClientResponse
  | ErrorResponse
