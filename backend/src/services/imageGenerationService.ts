import { experimental_generateImage as generateImage } from 'ai'
import { generateText } from 'ai'
import pino from 'pino'

import { google } from '@ai-sdk/google'
// Import only required provider modules
import { openai } from '@ai-sdk/openai'

import type {
  GenerateImageParams,
  ImageGenerationResponse,
  Message,
} from '../types/images'
import type { ModelProvider } from '../types/models'

// Provider type interfaces
type ProviderModule = {
  image: (modelId: string, options?: Record<string, unknown>) => unknown
}

// For language model providers
type LanguageProviderModule = (
  modelId: string,
  options?: Record<string, unknown>,
) => unknown

const logger = pino({ name: 'imageGenerationService' })

/**
 * Image generation options
 */
interface ImageGenerationOptions {
  model: unknown
  prompt: string
  n?: number
  size?: string
  aspectRatio?: string
  seed?: number
  providerOptions?: Record<string, Record<string, unknown>>
}

/**
 * Text generation options
 */
interface TextGenOptions {
  model: unknown
  prompt?: string
  messages?: Message[]
  providerOptions?: Record<string, Record<string, unknown>>
}

class ImageGenerationService {
  // Provider modules
  private providers: Record<string, ProviderModule | LanguageProviderModule> = {
    openai: openai,
    google: google,
  }

  constructor() {
    logger.info(
      'Image generation service initialized with providers: openai, google',
    )
  }

  /**
   * Get model instance for specified provider and model ID
   */
  private getModel(
    provider: ModelProvider,
    modelId: string,
    options?: Record<string, unknown>,
  ) {
    const providerModule = this.providers[provider]

    // Get model based on provider type
    if (provider === 'google') {
      // Google uses direct function call
      return (providerModule as LanguageProviderModule)(modelId, options)
    }

    // OpenAI uses object's image method
    return (providerModule as ProviderModule).image(modelId, options)
  }

  /**
   * Generate images
   */
  public async generateImageDirectly(
    params: GenerateImageParams,
  ): Promise<ImageGenerationResponse> {
    logger.info(
      `Generating image with: ${JSON.stringify({
        modelProvider: params.modelProvider,
        modelId: params.modelId,
        size: params.size,
        aspectRatio: params.aspectRatio,
        n: params.n,
        hasMessages: !!params.messages,
        messageCount: params.messages?.length,
      })}`,
    )

    try {
      // Handle multi-modal language models (like Google Gemini)
      if (params.isMultiModalLanguageModel) {
        return await this.generateImagesWithLanguageModel(params)
      }

      // Standard image generation models
      return await this.generateImagesWithImageModel(params)
    } catch (error) {
      logger.error(`Error generating image: ${(error as Error).message}`)
      throw error
    }
  }

  /**
   * Generate images using standard image generation model
   */
  private async generateImagesWithImageModel(
    params: GenerateImageParams,
  ): Promise<ImageGenerationResponse> {
    const model = this.getModel(params.modelProvider, params.modelId)

    const requestParams: ImageGenerationOptions = {
      model,
      prompt: params.prompt,
    }

    // Add optional parameters
    if (params.n && params.n > 1) {
      requestParams.n = params.n
    }

    if (params.size) {
      requestParams.size = params.size
    }

    if (params.aspectRatio) {
      requestParams.aspectRatio = params.aspectRatio
    }

    if (params.seed) {
      requestParams.seed = params.seed
    }

    // Add provider-specific options
    if (params.providerOptions) {
      requestParams.providerOptions = {} as Record<
        string,
        Record<string, unknown>
      >
      requestParams.providerOptions[params.modelProvider] =
        params.providerOptions as Record<string, unknown>
    }

    // Generate images
    const result = await generateImage(
      requestParams as unknown as Parameters<typeof generateImage>[0],
    )

    // Transform to unified response format
    if (result.images && result.images.length > 0) {
      return {
        images: result.images.map((img) => ({
          base64: img.base64,
          uint8Array: img.uint8Array,
        })),
        warnings: result.warnings || [],
      }
    }

    // Single image result
    if (result.image) {
      return {
        images: [
          {
            base64: result.image.base64,
            uint8Array: result.image.uint8Array,
          },
        ],
        warnings: result.warnings || [],
      }
    }

    throw new Error('No images were generated')
  }

  /**
   * Generate images using multi-modal language model (like Google Gemini)
   */
  private async generateImagesWithLanguageModel(
    params: GenerateImageParams,
  ): Promise<ImageGenerationResponse> {
    const model = this.getModel(params.modelProvider, params.modelId)

    // Setup provider-specific options for multi-modal output
    const providerOptions: Record<string, Record<string, unknown>> = {}

    // For Google models, ensure responseModalities includes IMAGE
    if (params.modelProvider === 'google') {
      providerOptions.google = {
        ...((params.providerOptions as Record<string, unknown>) || {}),
        responseModalities: ['TEXT', 'IMAGE'],
      }
    } else if (params.providerOptions) {
      providerOptions[params.modelProvider] = params.providerOptions as Record<
        string,
        unknown
      >
    }

    // Choose between conversation history or single prompt
    let textGenOptions: TextGenOptions

    if (params.messages && params.messages.length > 0) {
      // Use conversation history
      textGenOptions = {
        model,
        messages: params.messages,
        providerOptions,
      }
    } else {
      // Use single prompt
      textGenOptions = {
        model,
        prompt: params.prompt,
        providerOptions,
      }
    }

    const result = await generateText(
      textGenOptions as unknown as Parameters<typeof generateText>[0],
    )

    // Get text response
    const text = result.text

    // Extract images from files property
    if (result.files?.length > 0) {
      const imageFiles = result.files.filter((file) =>
        file.mimeType?.startsWith('image/'),
      )

      return {
        text,
        images: imageFiles.map((file) => ({
          base64: file.base64,
          uint8Array: file.uint8Array,
          mimeType: file.mimeType,
        })),
        warnings: [],
      }
    }

    // If we got text but no images, return just the text
    if (text) {
      return {
        text,
        images: [],
        warnings: [],
      }
    }

    throw new Error('No content was generated from the language model')
  }
}

export const imageGenerationService = new ImageGenerationService()
