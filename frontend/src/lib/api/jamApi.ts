// Define message structure (matching backend schema roughly)
// TODO: Move to a shared types definition
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

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api'

/**
 * Fetches messages for a specific Jam session.
 * Requires authentication cookie to be sent automatically by the browser.
 */
export const getJamMessages = async (jamId: string): Promise<Message[]> => {
  const response = await fetch(`${API_BASE_URL}/jams/${jamId}/messages`, {
    method: 'GET',
    headers: {
      // Authentication is handled by cookies, no explicit Authorization header needed here
      // if using HttpOnly cookies set by the backend.
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    // Attempt to parse error body for more details
    let errorBody: unknown // Use unknown for safer type handling
    try {
      errorBody = await response.json()
    } catch (e) {
      // Ignore if response body is not JSON
    }
    console.error('API Error fetching messages:', response.status, errorBody)
    throw new Error(
      // Type guard to safely access message property
      typeof errorBody === 'object' &&
        errorBody !== null &&
        'message' in errorBody &&
        typeof errorBody.message === 'string'
        ? errorBody.message
        : `Failed to fetch messages (status ${response.status})`,
    )
  }

  return response.json() as Promise<Message[]>
}

// --- Generate Image --- //

// Type for the request body of the generate endpoint
export interface GenerateImagePayload {
  prompt: string
  modelProvider: 'openai' | 'google' // Or fetch from backend capabilities?
  modelId: string
  size: string // e.g., "1024x1024"
}

// Type for the successful response (Task ID)
export interface GenerateImageResponse {
  taskId: string
}

// Type for API error responses (matching backend structure)
export interface ApiErrorResponse {
  code: number
  message: string
  currentVE?: number
  requiredVE?: number
  // Potentially add Zod error details field if backend sends them
}

/**
 * Sends a request to generate an image for a specific Jam.
 * Requires authentication cookie.
 */
export const generateImageForJam = async (
  jamId: string,
  payload: GenerateImagePayload,
): Promise<GenerateImageResponse> => {
  const response = await fetch(`${API_BASE_URL}/jams/${jamId}/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    let errorBody: unknown
    try {
      errorBody = await response.json()
    } catch (e) {
      /* Ignore */
    }

    console.error('API Error generating image:', response.status, errorBody)

    // Check if it's a structured API error
    if (
      typeof errorBody === 'object' &&
      errorBody !== null &&
      'message' in errorBody &&
      typeof errorBody.message === 'string'
    ) {
      // Re-throw with the structured error body if possible
      const apiError = new Error(errorBody.message) as Error &
        Partial<ApiErrorResponse>
      // Add extra properties from the error response if they exist
      if ('code' in errorBody && typeof errorBody.code === 'number')
        apiError.code = errorBody.code
      if ('currentVE' in errorBody && typeof errorBody.currentVE === 'number')
        apiError.currentVE = errorBody.currentVE
      if ('requiredVE' in errorBody && typeof errorBody.requiredVE === 'number')
        apiError.requiredVE = errorBody.requiredVE
      throw apiError
    }

    // Fallback generic error
    throw new Error(`Failed to generate image (status ${response.status})`)
  }

  // Status 202 Accepted returns { taskId: string }
  return response.json() as Promise<GenerateImageResponse>
}

// TODO: Add functions for creating jams, etc.
