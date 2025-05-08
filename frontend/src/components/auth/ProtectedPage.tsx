'use client'

import { useSession } from '@/lib/authClient'
import { Loader2 } from 'lucide-react' // Or your preferred loading spinner
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

interface ProtectedPageProps {
  children: React.ReactNode
  redirectTo?: string // Optional redirect path, defaults to home
  showWarning?: boolean // Optional: Show a message instead of redirecting immediately
}

/**
 * A client component wrapper to protect pages/content requiring authentication.
 * Uses the better-auth useSession hook.
 * Handles loading state and redirects unauthenticated users.
 */
export default function ProtectedPage({
  children,
  redirectTo = '/',
  showWarning = false,
}: ProtectedPageProps) {
  const { data: session, isPending } = useSession()
  const router = useRouter()

  useEffect(() => {
    // Only redirect if loading is finished and there's no session, and not showing a warning.
    if (!isPending && !session && !showWarning) {
      console.log('ProtectedPage: No session found, redirecting...')
      router.replace(redirectTo)
    }
  }, [isPending, session, router, redirectTo, showWarning])

  if (isPending) {
    // Optional: Add a more sophisticated loading skeleton
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    )
  }

  if (!session) {
    if (showWarning) {
      // Optionally show an access denied message
      return (
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] text-center">
          <h2 className="text-2xl font-semibold mb-4">Access Denied</h2>
          <p className="text-muted-foreground mb-6">
            You must be logged in to view this page.
          </p>
          {/* Optionally add a button to redirect manually */}
          <button
            type="button"
            onClick={() => router.push(redirectTo)}
            className="text-primary hover:underline"
          >
            Go to Home
          </button>
        </div>
      )
    }
    // If not showing warning, return null while redirect effect runs
    // (or the loader if redirect hasn't happened yet - though useEffect should catch it)
    return null
  }

  // Session exists, render the protected content
  return <>{children}</>
}
