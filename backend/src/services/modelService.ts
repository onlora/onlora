export interface AIModelInfo {
  value: string
  label: string
  description: string
}

class ModelService {
  public async getGenerationModels(): Promise<AIModelInfo[]> {
    // In the future, this could fetch from a config or database
    return [
      {
        value: 'gemini-2.0-flash-preview-image-generation',
        label: 'Gemini Flash',
        description: 'Google Gemini 2.0 Flash Image Generation Preview',
      },
    ]
  }
}

export const modelService = new ModelService()
