import type {
  GenerateImageParams,
  GenerationResponse,
  Message,
} from '../../types/images'
import { apiClient } from './apiClient'

/**
 * Error response for image generation failure
 */
export interface GenerationError {
  code: number
  message: string
  currentVE?: number
  requiredVE?: number
}

/**
 * Create a new jam session
 */
export async function createJamSession(): Promise<{ jamId: string }> {
  return apiClient<{ jamId: string }>('/jams', {
    method: 'POST',
    credentials: 'include',
  })
}

/**
 * Get all messages for a jam session
 */
export async function getJamMessages(jamId: string): Promise<Message[]> {
  return apiClient<Message[]>(`/jams/${jamId}/messages`, {
    credentials: 'include',
  })
}

/**
 * Generate an image in a jam session
 */
export async function generateImage(
  jamId: string,
  params: GenerateImageParams,
): Promise<GenerationResponse> {
  return apiClient<GenerationResponse, GenerateImageParams>(
    `/jams/${jamId}/generate`,
    {
      method: 'POST',
      credentials: 'include',
      body: params,
    },
  )
}
