import { apiClient } from './apiClient' // Import the new client

// Define message structure (matching backend schema roughly)
// TODO: Move to a shared types definition (or to apiTypes.ts)
export interface MessageImage {
  id: number
  url: string
  r2Key?: string
}

export interface Message {
  id: number | string // Allow string for optimistic IDs
  jam_id: number
  role: 'user' | 'ai'
  text: string | null
  images: MessageImage[] | null // JSONB can be null
  created_at: string
}

// API_BASE_URL is now in apiClient.ts

/**
 * Fetches messages for a specific Jam session.
 */
export const getJamMessages = async (jamId: string): Promise<Message[]> => {
  return apiClient<Message[]>(`/jams/${jamId}/messages`, {
    credentials: 'include',
  })
  // Error handling is now managed by apiClient
}

// --- Generate Image --- //

// Type for the request body of the generate endpoint
export interface GenerateImagePayload {
  prompt: string
  modelProvider: 'openai' | 'google' // Or fetch from backend capabilities?
  modelId: string
  size: string // e.g., "1024x1024"
}

// Type for the successful response from the generate endpoint
// This now reflects the direct return of the (assistant's) message object
export interface GenerateImageResponse {
  id: number // Message ID
  jamId: number // Jam ID (note: frontend Message type uses jam_id)
  role: 'ai'
  text: string | null
  images: MessageImage[] | null // Array of image data objects
  createdAt: string // ISO string (note: frontend Message type uses created_at)
  // The backend also includes top-level imageUrl and altText for the first image
  // which can be useful for direct display if the frontend chooses to use them.
  imageUrl?: string
  altText?: string
}

// ApiErrorResponse is now imported from apiClient.ts

/**
 * Sends a request to generate an image for a specific Jam.
 */
export const generateImageForJam = async (
  jamId: string,
  payload: GenerateImagePayload,
): Promise<GenerateImageResponse> => {
  return apiClient<GenerateImageResponse>(`/jams/${jamId}/generate`, {
    method: 'POST',
    body: payload as unknown as Record<string, unknown>, // apiClient handles JSON.stringify for non-FormData
    credentials: 'include',
  })
  // Error handling and structured error creation are now managed by apiClient
}

// TODO: Add functions for creating jams, etc.
// Example for creating a jam (assuming it returns { jamId: number }):
export interface CreateJamResponse {
  jamId: number
  // Any other initial data from the backend, e.g., createdAt for the jam
  // createdAt: string;
}

/**
 * Creates a new Jam session.
 */
export const createJam = async (): Promise<CreateJamResponse> => {
  return apiClient<CreateJamResponse>('/jams', {
    method: 'POST',
    credentials: 'include',
  })
}
