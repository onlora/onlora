import type { ModelProvider } from './models'

/**
 * Message for conversation history
 */
export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  name?: string
}

/**
 * Parameters for image generation
 */
export interface GenerateImageParams {
  prompt: string
  modelId: string
  modelProvider: ModelProvider
  size?: string
  aspectRatio?: string
  n?: number
  seed?: number
  providerOptions?: Record<string, unknown>
  isMultiModalLanguageModel?: boolean
  // For conversation history
  messages?: Message[]
}

/**
 * Image object returned from generation service
 */
export interface ImageObject {
  base64: string
  uint8Array?: Uint8Array
  mimeType?: string
  url?: string
}

/**
 * Image generation response
 */
export interface ImageGenerationResponse {
  images: ImageObject[]
  text?: string
  warnings?: unknown[]
}

/**
 * Type for an image object stored in the database
 */
export interface MessageImageData {
  id: string // A unique ID for this image instance, e.g., timestamp or UUID
  url: string // URL or Base64 Data URI
  altText?: string
  // Potentially other metadata: width, height, modelUsed etc.
}
