import type { AIModelData } from '../../types/models'
import { apiClient } from './apiClient'

/**
 * Fetches the available AI generation models from the backend.
 */
export async function getGenerationModels(): Promise<AIModelData[]> {
  try {
    const models = await apiClient<AIModelData[]>('/models/generation', {
      method: 'GET',
    })
    return models
  } catch (error) {
    // Log or handle specific errors if needed, otherwise rethrow
    // The apiClient should throw an ApiError which can be caught by the UI component
    console.error('Error fetching generation models:', error)
    throw error // Rethrowing the error to be handled by the caller
  }
}
