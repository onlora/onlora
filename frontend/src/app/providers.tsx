'use client'

import queryClient from '@/lib/query-client' // Assuming @ points to src/
import type React from 'react'
import { QueryClientProvider } from 'react-query'

interface ProvidersProps {
  children: React.ReactNode
}

export default function Providers({ children }: ProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
