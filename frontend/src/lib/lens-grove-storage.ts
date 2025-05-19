import { chains } from '@lens-chain/sdk/viem'
import { StorageClient } from '@lens-chain/storage-client'

// Create and export storage client with default settings
// When integrating, we need to install @lens-chain/storage-client and configure properly
export const lensGroveStorageClient = StorageClient.create()

// Define ACL chain ID for Lens using the SDK's chain IDs
export const storageAclChainId = chains.mainnet.id
