/**
 * Complete model data with provider and capability information
 */
export interface AIModelData {
  value: string // Unique identifier for the model
  label: string // User-friendly display name
  provider: 'google' | 'openai' // The provider of the model
  description: string // A brief description of the model
  isMultiModalLanguageModel?: boolean // Whether this is a multi-modal LLM that can generate images
  supportedSizes?: string[] // Array of supported size strings like "1024x1024"
  supportedAspectRatios?: string[] // Array of supported aspect ratios like "16:9"
}

/**
 * Supported model providers
 */
export type ModelProvider = 'openai' | 'google'

/**
 * Image size types commonly used in the application
 */
export type ImageSize = '512x512' | '768x768' | '1024x1024' | string

/**
 * Aspect ratio types commonly used in the application
 */
export type AspectRatio =
  | '1:1'
  | '3:4'
  | '4:3'
  | '9:16'
  | '16:9'
  | '9:21'
  | '21:9'
  | string
