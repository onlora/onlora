import { PublicClient, mainnet } from '@lens-protocol/client'

// Create a Lens PublicClient instance pointing to the appropriate environment
// Using mainnet by default, can be configured for testnet if needed
export const lensClient = PublicClient.create({
  environment: mainnet,
  // Specify app origin for tracking purposes
  origin: 'https://onlora.ai',
  // Use localStorage to persist session across page refreshes
  storage: typeof window !== 'undefined' ? window.localStorage : undefined,
})

// Test app address - should be replaced with actual app address in production
export const TEST_LENS_APP_ID = '0x8A5Cc31180c37078e1EbA2A23c861Acf351a97cE' // Mainnet test app
