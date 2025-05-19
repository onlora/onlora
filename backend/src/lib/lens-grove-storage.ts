import { chains } from '@lens-chain/sdk/viem'
import { StorageClient, immutable } from '@lens-chain/storage-client'

// Create and export storage client with default settings
export const lensGroveStorageClient = StorageClient.create()

// Define ACL chain ID for Lens using the SDK's chain IDs
export const storageAclChainId = chains.mainnet.id

// Export immutable ACL helper
export const getImmutableAcl = () => immutable(storageAclChainId)
