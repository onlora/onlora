'use client'

import queryClient from '@/lib/query-client' // Assuming @ points to src/
import { QueryClientProvider } from '@tanstack/react-query'
import { ConnectKitProvider, getDefaultConfig } from 'connectkit'
import type React from 'react'
import { http, WagmiProvider, createConfig } from 'wagmi'
import { lens } from 'wagmi/chains'

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
if (!walletConnectProjectId) {
  throw new Error('NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set')
}

interface ProvidersProps {
  children: React.ReactNode
}

// Create wagmi config
const config = createConfig(
  getDefaultConfig({
    chains: [lens],
    transports: {
      [lens.id]: http(),
    },
    walletConnectProjectId: walletConnectProjectId,
    appName: 'onlora',
  }),
)

export default function Providers({ children }: ProvidersProps) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider>{children}</ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
