import { experimental_generateImage as generateImage } from 'ai'
import { generateText } from 'ai'
import pino from 'pino'

import { createGoogleGenerativeAI } from '@ai-sdk/google'
// Import only required provider modules
import { createOpenAI } from '@ai-sdk/openai'
import { config } from '../config'

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
  // Provider modules (initialized with apiKey/baseURL from config)
  private providers: Record<string, ProviderModule | LanguageProviderModule>

  constructor() {
    // Instantiate providers with apiKey/baseURL from config
    const openaiProvider = createOpenAI({
      apiKey: config.openaiApiKey,
      baseURL: config.openaiBaseUrl,
    })
    const googleProvider = createGoogleGenerativeAI({
      apiKey: config.googleGenerativeAiApiKey,
    })
    this.providers = {
      openai: openaiProvider,
      google: googleProvider,
    }
    logger.info(
      'Image generation service initialized with providers: openai, google (with config)',
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

      logger.info(
        'Configured Google Gemini with responseModalities: TEXT,IMAGE',
      )
    } else if (params.providerOptions) {
      providerOptions[params.modelProvider] = params.providerOptions as Record<
        string,
        unknown
      >
    }

    // Create a deep copy of the messages array to avoid modifying the original
    const messagesWithCurrentPrompt = params.messages
      ? [
          ...params.messages,
          // Append the current prompt as a user message
          {
            role: 'user' as const,
            content: params.prompt,
          },
        ]
      : undefined

    // Choose between conversation history or single prompt
    let textGenOptions: TextGenOptions

    if (messagesWithCurrentPrompt && messagesWithCurrentPrompt.length > 0) {
      // Use conversation history with current prompt
      textGenOptions = {
        model,
        messages: messagesWithCurrentPrompt,
        providerOptions,
      }

      logger.info(
        `Using multi-modal model with conversation history (${messagesWithCurrentPrompt.length} messages) including current prompt: "${params.prompt.substring(0, 50)}${params.prompt.length > 50 ? '...' : ''}"`,
      )
    } else {
      // Use single prompt
      textGenOptions = {
        model,
        prompt: params.prompt,
        providerOptions,
      }

      logger.info(
        `Using multi-modal model with single prompt: "${params.prompt.substring(0, 50)}${params.prompt.length > 50 ? '...' : ''}"`,
      )
    }

    try {
      logger.info(
        `Sending request to ${params.modelProvider}/${params.modelId} for image generation`,
      )

      logger.info(`textGenOptions: ${JSON.stringify(textGenOptions, null, 2)}`)

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

        logger.info(`Found ${imageFiles.length} image files in response`)

        if (imageFiles.length === 0) {
          logger.warn(
            `No image files found in response from ${params.modelProvider}/${params.modelId}`,
          )
        }

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

      // Log the absence of files
      logger.warn(
        `No files property found in response from ${params.modelProvider}/${params.modelId}`,
      )

      // If we got text but no images, return just the text
      return {
        text,
        images: [],
        warnings: [
          'No images were generated. The model responded with text only.',
        ],
      }
    } catch (error) {
      logger.error(
        `Error generating images with language model: ${(error as Error).message}`,
      )
      throw error
    }
  }
}

export const imageGenerationService = new ImageGenerationService()
