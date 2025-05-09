'use client'

import { Button } from '@/components/ui/button'
import { authClient, useSession } from '@/lib/authClient'
import { Bell, Home, Plus } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const isLoggedIn = !!session?.user

  // Check if the given path is active
  const isActive = (path: string) => {
    if (path === '/' && pathname === '/') return true
    if (path !== '/' && pathname.startsWith(path)) return true
    return false
  }

  // Handle Google sign in
  const handleGoogleSignIn = async () => {
    try {
      await authClient.signIn.social({ provider: 'google' })
    } catch (error) {
      console.error('Google Sign-In failed:', error)
    }
  }

  // Navigation items with corresponding paths, icons and labels
  const navigationItems = [
    {
      path: '/',
      icon: <Home className="h-5 w-5 mr-3" />,
      label: 'Discover',
    },
    {
      path: '/jam/new',
      icon: <Plus className="h-5 w-5 mr-3" />,
      label: 'Create',
    },
    {
      path: '/notifications',
      icon: <Bell className="h-5 w-5 mr-3" />,
      label: 'Notifications',
    },
  ]

  return (
    <div className="h-[calc(100vh-4rem)] w-[250px] fixed left-0 top-16 flex flex-col bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex-1 flex flex-col py-6 px-3">
        <nav className="space-y-1">
          {navigationItems.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className={`flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all hover:bg-muted/50 ${
                isActive(item.path)
                  ? 'text-primary bg-primary/5'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}

          {!isLoggedIn && (
            <Button
              onClick={handleGoogleSignIn}
              className="w-full mt-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl h-11"
            >
              Sign in to Create
            </Button>
          )}
        </nav>
      </div>
    </div>
  )
}
