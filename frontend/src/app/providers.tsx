'use client'

import queryClient from '@/lib/query-client' // Assuming @ points to src/
import { QueryClientProvider } from '@tanstack/react-query'
import type React from 'react'

interface ProvidersProps {
  children: React.ReactNode
}

export default function Providers({ children }: ProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
