export interface AIModelInfo {
  value: string
  label: string
  description: string
}

// Define the structure for AI model data, ensuring it includes the provider
// This type might also be shared or imported if used in routes/controllers directly.
export interface AIModelData {
  value: string // Unique identifier for the model
  label: string // User-friendly display name
  provider: 'google' | 'openai' // The provider of the model
  description: string // A brief description of the model
}

class ModelService {
  public async getGenerationModels(): Promise<AIModelData[]> {
    // In the future, this could fetch from a config or database
    return [
      {
        value: 'gemini-2.0-flash-preview-image-generation',
        label: 'Gemini Flash Image Gen',
        provider: 'google', // Explicitly add the provider
        description: 'Fast image generation model by Google.',
      },
    ]
  }
}

export const modelService = new ModelService()
