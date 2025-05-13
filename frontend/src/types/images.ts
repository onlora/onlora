import type { ModelProvider } from './models'

/**
 * Message for conversation history
 */
export interface Message {
  id?: string
  role: 'user' | 'ai' | 'system'
  content?: string
  text?: string | null // Frontend often uses text instead of content
  name?: string
  images?: MessageImage[] | null
  createdAt?: string
  jam_id?: string // Legacy field for compatibility
  created_at?: string // Legacy field for compatibility
}

/**
 * Image object in a message
 */
export interface MessageImage {
  id: string
  url: string
  altText?: string
  width?: number
  height?: number
}

/**
 * Parameters for generating images from an AI model
 */
export interface GenerateImageParams {
  prompt: string
  modelProvider: ModelProvider
  modelId: string
  size?: string
  aspectRatio?: string
  isMultiModalLanguageModel?: boolean
  messages?: Message[]
}

/**
 * Response from image generation
 */
export interface GenerationResponse {
  id: string
  jamId: string
  role: 'ai'
  text: string | null
  images: MessageImage[] | null
  createdAt: string
  imageUrl?: string
  altText?: string
}
