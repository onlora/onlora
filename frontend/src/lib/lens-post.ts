import { txHash, uri } from '@lens-protocol/client'
import { fetchPost, post } from '@lens-protocol/client/actions'
import { handleOperationWith } from '@lens-protocol/client/viem'
import type { WalletClient } from 'viem'
import type { CreatePostPayload, LinkLensPostPayload } from './api/postApi'
import {
  linkLensPost as apiLinkLensPost,
  prepareLensMetadata,
} from './api/postApi'
import { sessionClient } from './lens-client'

interface LensPublishResult {
  lensPostId: string
  lensContentUri: string
  lensTransactionHash: string
  lensAccountId: string
}

/**
 * Publish a post to Lens Protocol
 * Uses the full Lens Protocol posting flow: create metadata, upload metadata, create post
 */
export async function publishToLens(
  postData: CreatePostPayload,
  onloraPostId: string,
  walletClient: WalletClient,
): Promise<LensPublishResult> {
  if (!sessionClient) {
    throw new Error('Lens session not available. Please log in first.')
  }

  // Step 1: Prepare metadata using backend endpoint
  const { contentUri } = await prepareLensMetadata({
    postId: onloraPostId,
    title: postData.title,
    description: postData.description,
    images: postData.images,
  })

  // Step 2: Chain up to waitForTransaction to get transactionHash
  const result = await post(sessionClient, { contentUri: uri(contentUri) })
    .andThen(handleOperationWith(walletClient))
    .andThen(sessionClient.waitForTransaction)

  if (result.isErr()) {
    throw new Error(
      `Transaction failed or not indexed: ${result.error.message}`,
    )
  }

  const transactionHash = result.value

  // Step 3: Fetch the real Lens post
  const fetchResult = await fetchPost(sessionClient, {
    txHash: txHash(transactionHash),
  })
  if (fetchResult.isErr()) {
    throw new Error(`Failed to fetch Lens post: ${fetchResult.error.message}`)
  }
  const lensPost = fetchResult.value
  if (!lensPost) {
    throw new Error('Fetched Lens post is null')
  }

  return {
    lensPostId: lensPost.id,
    lensContentUri: contentUri,
    lensTransactionHash: transactionHash,
    lensAccountId: lensPost.author?.address || '',
  }
}

/**
 * Link Lens post information with an Onlora post
 */
export async function linkLensPost(
  onloraPostId: string,
  lensData: LensPublishResult,
): Promise<void> {
  try {
    const payload: LinkLensPostPayload = {
      postId: onloraPostId,
      lensPostId: lensData.lensPostId,
      lensContentUri: lensData.lensContentUri,
      lensTransactionHash: lensData.lensTransactionHash,
      lensAccountId: lensData.lensAccountId,
    }

    await apiLinkLensPost(payload)
    console.log('Successfully linked Onlora post to Lens post')
  } catch (error) {
    console.error('Error linking Lens post:', error)
    throw error
  }
}
