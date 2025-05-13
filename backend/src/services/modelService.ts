import type { AIModelData } from '../types/models'

class ModelService {
  public async getGenerationModels(): Promise<AIModelData[]> {
    // In the future, this could fetch from a config or database
    return [
      {
        value: 'gemini-2.0-flash-preview-image-generation',
        label: 'Gemini Flash Image Gen',
        provider: 'google',
        description: 'Fast image generation model by Google.',
        isMultiModalLanguageModel: true,
        supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
      },
      {
        value: 'dall-e-3',
        label: 'DALL-E 3',
        provider: 'openai',
        description: 'High-quality image generation model by OpenAI.',
        isMultiModalLanguageModel: false,
        supportedSizes: ['1024x1024', '1792x1024', '1024x1792'],
      },
      {
        value: 'dall-e-2',
        label: 'DALL-E 2',
        provider: 'openai',
        description: 'Smaller, faster image generation model by OpenAI.',
        isMultiModalLanguageModel: false,
        supportedSizes: ['256x256', '512x512', '1024x1024'],
      },
    ]
  }
}

export const modelService = new ModelService()
