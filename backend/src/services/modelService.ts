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
        value: 'gpt-image-1',
        label: 'GPT Image 1',
        provider: 'openai',
        description: 'High-quality image generation model by OpenAI.',
        isMultiModalLanguageModel: false,
        supportedSizes: ['1024x1024', '1536x1024', '1024x1536'],
      },
    ]
  }
}

export const modelService = new ModelService()
