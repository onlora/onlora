import { PublicClient, mainnet } from '@lens-protocol/client'

// Create a PublicClient instance pointing to the appropriate environment
// Use mainnet by default, we can add config-based switching later if needed
export const lensClient = PublicClient.create({
  environment: mainnet,
  // For server-side usage, specify the origin
  origin: 'https://onlora.ai',
})
