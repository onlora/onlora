/**
 * Base model information interface
 */
export interface AIModelInfo {
  value: string
  label: string
  description: string
}

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
