export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api'

/**
 * Represents a structured API error.
 */
export interface ApiErrorResponse {
  code?: number // Optional because not all HTTP errors will have a custom code
  message: string
  details?: unknown // Changed from any to unknown
  // Backend specific fields for more context, e.g.:
  currentVE?: number
  requiredVE?: number
}

/**
 * Custom error class for API request failures.
 */
export class ApiError extends Error {
  status: number
  responseBody: ApiErrorResponse | null // Can be null if body parsing failed or not JSON

  constructor(
    message: string,
    status: number,
    responseBody: ApiErrorResponse | null = null,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.responseBody = responseBody

    // This is necessary for proper Error subclassing in ES6
    Object.setPrototypeOf(this, ApiError.prototype)
  }
}

// Make RequestOptions generic for the body type B
export interface RequestOptions<B = Record<string, unknown>>
  extends Omit<RequestInit, 'body'> {
  body?: B | FormData
}

/**
 * Generic API request helper.
 * @param endpoint - The API endpoint (e.g., '/jams', '/users/profile').
 * @param options - RequestInit options (method, headers, body, etc.).
 * @returns A promise that resolves to the JSON response.
 * @throws ApiError if the request fails.
 */
export async function apiClient<T = unknown, B = Record<string, unknown>>(
  endpoint: string,
  options: RequestOptions<B> = {},
): Promise<T> {
  const { body, ...fetchOptions } = options
  const headers = new Headers(fetchOptions.headers || {})

  if (!(body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  const config: RequestInit = {
    ...fetchOptions,
    headers,
    ...(body && !(body instanceof FormData) && { body: JSON.stringify(body) }),
    ...(body && body instanceof FormData && { body }),
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config)

  if (!response.ok) {
    let errorJson: ApiErrorResponse | null = null
    try {
      const errorData = await response.json()
      errorJson = {
        message:
          (errorData as ApiErrorResponse).message ||
          'An unknown error occurred',
        code: (errorData as ApiErrorResponse).code,
        details: (errorData as ApiErrorResponse).details,
        currentVE: (errorData as ApiErrorResponse).currentVE,
        requiredVE: (errorData as ApiErrorResponse).requiredVE,
      }
    } catch (e) {
      console.warn('API Error: Could not parse error response body as JSON.', e)
    }

    const errorMessage =
      errorJson?.message ||
      `HTTP error ${response.status}: ${response.statusText || 'Request failed'}`

    console.error(`API Error: ${response.status} ${endpoint}`, {
      status: response.status,
      statusText: response.statusText,
      responseBody: errorJson,
      endpoint,
      options,
    })

    throw new ApiError(errorMessage, response.status, errorJson)
  }

  if (response.status === 204) {
    return undefined as T
  }

  try {
    return (await response.json()) as T
  } catch (e) {
    console.error(
      'API Success: Could not parse success response body as JSON.',
      e,
      response,
    )
    throw new ApiError(
      'Failed to parse successful response from server.',
      response.status,
      null,
    )
  }
}
