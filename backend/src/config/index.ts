import 'dotenv/config'

export const config = {
  logLevel: process.env.LOG_LEVEL || 'info',
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  openaiApiKey: process.env.OPENAI_API_KEY,
  googleApiKey: process.env.GOOGLE_API_KEY,
  r2BucketName: process.env.R2_BUCKET_NAME,
  r2AccountId: process.env.R2_ACCOUNT_ID,
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID,
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  r2PublicUrlBase: process.env.R2_PUBLIC_URL_BASE,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  jwtSecret: process.env.JWT_SECRET,
  googleRedirectUri:
    process.env.GOOGLE_REDIRECT_URI ||
    'http://localhost:8080/login/google/callback',
  // Add other environment variables here as needed
  // For example:
  port: process.env.PORT || '8080',
}

// You can also add more specific checks or defaults
if (!config.databaseUrl) {
  console.error('FATAL ERROR: DATABASE_URL is not defined.')
  process.exit(1)
}
if (!config.openaiApiKey) {
  console.warn(
    'Warning: OPENAI_API_KEY is not defined. OpenAI features may not work.',
  )
}
if (!config.googleApiKey) {
  console.warn(
    'Warning: GOOGLE_API_KEY is not defined. Google AI features may not work.',
  )
}
if (
  !config.r2BucketName ||
  !config.r2AccountId ||
  !config.r2AccessKeyId ||
  !config.r2SecretAccessKey ||
  !config.r2PublicUrlBase
) {
  console.warn(
    'Warning: R2 environment variables are not fully configured. File upload features may not work.',
  )
}
if (!config.googleClientId || !config.googleClientSecret) {
  console.warn(
    'Warning: Google OAuth environment variables (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) are not fully configured. Google Sign-In may not work.',
  )
}
if (!config.jwtSecret) {
  // For JWT_SECRET, it's critical for security, so it might be better to error out if not in production
  if (config.nodeEnv === 'production') {
    console.error(
      'FATAL ERROR: JWT_SECRET is not defined in a production environment.',
    )
    process.exit(1)
  } else {
    console.warn(
      'Warning: JWT_SECRET is not defined. This is okay for development but MUST be set in production.',
    )
  }
}
if (!config.googleRedirectUri) {
  console.warn(
    'Warning: GOOGLE_REDIRECT_URI is not defined. Google Sign-In callback may not work as expected. Defaulting to http://localhost:8080/login/google/callback',
  )
}
