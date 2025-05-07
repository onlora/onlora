export const GEN_TASK_QUEUE_NAME = 'gen-task'

export interface GenTaskPayload {
  taskId: string // To track the task, potentially for SSE updates
  jamId: string // The chat session this generation belongs to
  prompt: string
  model: string // e.g., 'dall-e-3', 'gemini-pro-vision'
  size: string // e.g., '1024x1024'
  userId: string // User who initiated the generation
  // Add other relevant fields from GenerateImageOptions or GenerateContentOptions as needed
}

export const GEN_TASK_QUEUE_OPTIONS = {
  // Default options for pg-boss jobs, can be overridden when publishing
  // Concurrency for workers processing this queue will be set up in the worker itself.
  // As per mvp_tech_spec.md:
  // concurrent: 8, // This is typically set on the worker side (boss.work)
  retryLimit: 2,
  retryDelay: 5, // seconds for the first retry
  retryBackoff: true, // exponential backoff, so second retry will be 5*2 = 10s, or 5*N for Nth retry based on boss config.
  // tech spec says 5s -> 30s. pg-boss default backoff should achieve something similar or can be customized.
  expireInSeconds: 90, // Task timeout
  // For more specific retry strategies (e.g., 5s then 30s), pg-boss might require custom logic or specific version features.
  // For now, relying on standard retryLimit and retryDelay with backoff.
}

export const REFRESH_HOT_QUEUE_NAME = 'refresh-hot'

export const REFRESH_HOT_CRON_SCHEDULE = '*/10 * * * *' // Every 10 minutes
