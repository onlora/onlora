import { google } from '@ai-sdk/google'
import { openai } from '@ai-sdk/openai'
import {
  type CoreMessage,
  type GenerateTextResult,
  type ImagePart,
  type JSONValue,
  type LanguageModel,
  NoImageGeneratedError,
  experimental_generateImage as generateImage,
  generateText,
} from 'ai'
import pino from 'pino'
import { config } from '../config'

const logger = pino({
  level: config.logLevel,
  transport:
    config.nodeEnv !== 'production' ? { target: 'pino-pretty' } : undefined,
  name: 'ai-lib',
})

if (!config.openaiApiKey) {
  logger.warn('OPENAI_API_KEY not set. OpenAI models will not be available.')
}
if (!config.googleApiKey) {
  logger.warn(
    'GOOGLE_API_KEY not set. Google Gemini models will not be available.',
  )
}

export interface GeneratedFile {
  // fileName?: string; // Vercel AI SDK FilePart doesn't guarantee fileName
  mimeType: string
  base64Data?: string
  uint8ArrayData?: Uint8Array
}

// Define a more specific structure for known provider options
interface GoogleProviderGenTextOptions {
  responseModalities?: ('TEXT' | 'IMAGE')[]
  // Add other Google-specific options here as needed
  [key: string]: JSONValue | undefined // Explicit index signature
}

type OpenAIProviderGenTextOptions = Record<string, never>

export interface GenerateContentOptions {
  prompt: string
  messages?: CoreMessage[]
  modelProvider: 'openai' | 'google'
  modelId: string
  providerOptions?: {
    google?: GoogleProviderGenTextOptions
    openai?: OpenAIProviderGenTextOptions
    // Can add other providers here
  }
}

/**
 * Generates content (text and potentially files like images) using a specified LLM
 * with generateText, suitable for multi-modal models.
 */
export const generateContentWithLLM = async (
  options: GenerateContentOptions,
): Promise<{
  textContent: string
  files: GeneratedFile[]
  providerResponse: GenerateTextResult<Record<string, never>, string>
} | null> => {
  const {
    prompt,
    messages: contextMessages,
    modelProvider,
    modelId,
    providerOptions,
  } = options

  let model: LanguageModel

  switch (modelProvider) {
    case 'openai':
      if (!config.openaiApiKey) {
        logger.error('OpenAI API Key not configured for generateText.')
        return null
      }
      model = openai(modelId)
      break
    case 'google':
      if (!config.googleApiKey) {
        logger.error('Google API Key not configured for generateText.')
        return null
      }
      model = google(modelId)
      break
    default:
      logger.error(
        `Unsupported model provider for generateText: ${modelProvider}`,
      )
      return null
  }

  const messages: CoreMessage[] = [
    ...(contextMessages || []),
    { role: 'user', content: prompt },
  ]

  try {
    logger.info(
      `Requesting content generation with ${modelProvider}/${modelId} (generateText), prompt: "${prompt}"`,
    )

    let providerOptionsForCall:
      | Record<string, Record<string, JSONValue>>
      | undefined = undefined

    if (modelProvider === 'google' && providerOptions?.google) {
      if (Object.keys(providerOptions.google).length > 0) {
        providerOptionsForCall = {
          google: providerOptions.google as Record<string, JSONValue>,
        }
      }
    } else if (modelProvider === 'openai' && providerOptions?.openai) {
      // OpenAIProviderGenTextOptions is Record<string, never>, so it should be an empty object {}.
      // An empty object IS a valid Record<string, JSONValue>.
      providerOptionsForCall = {
        openai: providerOptions.openai as Record<string, JSONValue>,
      }
    }

    const result = await generateText({
      model: model,
      messages: messages,
      providerOptions: providerOptionsForCall,
    })

    const generatedFiles: GeneratedFile[] = []
    if (result.files && result.files.length > 0) {
      for (const file of result.files) {
        const currentFile: GeneratedFile = { mimeType: file.mimeType }
        if (file.base64) {
          currentFile.base64Data = file.base64
        } else if (file.uint8Array) {
          currentFile.uint8ArrayData = file.uint8Array
        }
        generatedFiles.push(currentFile)
        logger.info(
          `Processed file (from generateText) with MIME type: ${file.mimeType}`,
        )
      }
    }

    logger.info('Successfully generated content (via generateText).')
    return {
      textContent: result.text,
      files: generatedFiles,
      providerResponse: result,
    }
  } catch (error: unknown) {
    const errToLog = error instanceof Error ? error : new Error(String(error))
    logger.error(
      { err: errToLog },
      `Error generating content with ${modelProvider}/${modelId} (generateText)`,
    )
    return null
  }
}

// --- New Image Generation Function using experimental_generateImage ---

export interface GeneratedImageData {
  base64Image?: string
  uint8ArrayImage?: Uint8Array
  imageUrl?: string // If the AI service returns a URL directly
  mimeType?: string
  seed?: string | number // Optional seed, if provided by the AI
  revisedPrompt?: string // Optional revised prompt from the AI
  url?: string
}

// Define a type for the actual result of experimental_generateImage
// This is based on the SDK documentation: { image?: ImagePart; images?: ImagePart[]; warnings?: any[]; providerResponse?: any; }
// Let's use a more specific type based on ReturnType for `providerResponse` in our result interface.
type AISDKGenerateImageCallResult = ReturnType<
  typeof generateImage
> extends Promise<infer R>
  ? R
  : never

export interface GenerateImageOptions {
  prompt: string
  modelProvider: 'openai'
  modelId: string
  size?: `${number}x${number}`
  aspectRatio?: `${number}:${number}`
  numberOfImages?: number
  seed?: number
  providerOptions?: {
    openai?: {
      style?: 'vivid' | 'natural'
      quality?: 'standard' | 'hd'
      // other DALL-E specific options
    } & Record<string, JSONValue> // Allow other provider options
  }
  abortSignal?: AbortSignal
  headers?: Record<string, string>
}

// Define a basic warning structure if SDK doesn't provide a specific one
interface SDKWarning {
  message: string
  [key: string]: unknown // Allow other properties
}

export interface GenerateImageResult {
  images: GeneratedImageData[]
  warnings?: SDKWarning[] // Use a more specific warning type
  providerResponse?: AISDKGenerateImageCallResult // Use the inferred type
}

/**
 * Generates images using a dedicated image model via experimental_generateImage.
 */
export const generateImageWithDedicatedModel = async (
  options: GenerateImageOptions,
): Promise<GenerateImageResult | null> => {
  const {
    prompt,
    modelProvider,
    modelId,
    size,
    aspectRatio,
    numberOfImages = 1,
    seed,
    providerOptions,
    abortSignal,
    headers,
  } = options

  if (modelProvider !== 'openai') {
    logger.error(
      `Unsupported model provider for generateImage: ${modelProvider}. Currently only 'openai' is supported.`,
    )
    return null
  }

  if (!config.openaiApiKey) {
    logger.error(
      'OpenAI API Key not configured for generateImage. Cannot generate image.',
    )
    return null
  }

  try {
    const imageModel = openai.image(
      modelId as Parameters<typeof openai.image>[0],
    )

    logger.info(
      `Requesting image generation with ${modelProvider}/${modelId} (experimental_generateImage), prompt: "${prompt}"`,
    )

    // The SDK types for size/aspectRatio within generateImage are specific.
    // We cast carefully or let the SDK validate.
    // The `generateImage` function itself is generic, `Parameters<typeof generateImage>[0]` gives its options.
    type GenerateImageCallParams = Parameters<typeof generateImage>[0]

    const result: AISDKGenerateImageCallResult = await generateImage({
      model: imageModel,
      prompt,
      // Conditionally add size or aspectRatio to avoid passing undefined if not provided
      ...(size && { size: size as GenerateImageCallParams['size'] }),
      ...(aspectRatio && {
        aspectRatio: aspectRatio as GenerateImageCallParams['aspectRatio'],
      }),
      n: numberOfImages,
      seed,
      // The providerOptions for generateImage is { [providerId: string]: Record<string, unknown> }
      // So, options.providerOptions should fit this structure.
      providerOptions:
        providerOptions as GenerateImageCallParams['providerOptions'],
      abortSignal,
      headers,
    })

    // result.images is ImagePart[] if n > 1 or not specified and model generates multiple
    // result.image is ImagePart if n = 1 and model generates single
    // We'll standardize to always return an array in our GenerateImageResult
    let sdkImages: ImagePart[] = []

    if (result) {
      if (result.images && result.images.length > 0) {
        sdkImages = result.images as unknown as ImagePart[]
      } else if (result.image) {
        sdkImages = [result.image as unknown as ImagePart]
      }
    }

    const processedImages: GeneratedImageData[] = sdkImages.map(
      (img: ImagePart): GeneratedImageData => {
        const genImgData: GeneratedImageData = {}
        if (typeof img.image === 'string') {
          genImgData.base64Image = img.image
        } else if (img.image instanceof Uint8Array) {
          genImgData.uint8ArrayImage = img.image
        }
        if (img.mimeType) {
          genImgData.mimeType = img.mimeType
        }
        return genImgData
      },
    )

    logger.info(
      `Successfully generated ${processedImages.length} image(s) (via experimental_generateImage).`,
    )

    return {
      images: processedImages,
      warnings: result.warnings as SDKWarning[] | undefined,
      providerResponse: result,
    }
  } catch (error: unknown) {
    if (NoImageGeneratedError.isInstance(error)) {
      logger.error(
        {
          err: error,
          cause: error.cause,
          responses: error.responses,
        },
        `AI SDK NoImageGeneratedError with ${modelProvider}/${modelId} (experimental_generateImage)`,
      )
    } else {
      const errToLog = error instanceof Error ? error : new Error(String(error))
      logger.error(
        { err: errToLog },
        `Error generating image with ${modelProvider}/${modelId} (experimental_generateImage)`,
      )
    }
    return null
  }
}
