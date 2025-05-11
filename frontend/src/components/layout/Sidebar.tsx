'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { authClient, useSession } from '@/lib/authClient'
import { getInitials } from '@/lib/utils'
import {
  Bell,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Coins,
  Home,
  LayoutGrid,
  LogOut,
  Plus,
  User,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

export default function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const user = session?.user
  const isLoggedIn = !!user
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)

  // Check if the given path is active
  const isActive = (path: string) => {
    if (path === '/' && pathname === '/') return true
    if (path !== '/' && pathname.startsWith(path)) return true
    return false
  }

  // Handle Google sign in
  const handleGoogleSignIn = async () => {
    try {
      await authClient.signIn.social({
        provider: 'google',
        callbackURL: 'http://localhost:3000',
      })
    } catch (error) {
      console.error('Google Sign-In failed:', error)
    }
  }

  // Handle sign out
  const handleSignOut = async () => {
    try {
      await authClient.signOut()
      setIsProfileMenuOpen(false)
    } catch (error) {
      console.error('Sign Out failed:', error)
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
      requireAuth: true,
    },
    {
      path: '/notifications',
      icon: <Bell className="h-5 w-5 mr-3" />,
      label: 'Notifications',
      requireAuth: true,
    },
  ]

  const profileItems = [
    {
      path: '/profile',
      icon: <User className="h-5 w-5 mr-3" />,
      label: 'Profile',
    },
    {
      path: '/gallery',
      icon: <LayoutGrid className="h-5 w-5 mr-3" />,
      label: 'My Gallery',
    },
    {
      path: '/profile/bookmarks',
      icon: <Bookmark className="h-5 w-5 mr-3" />,
      label: 'Bookmarks',
    },
    {
      path: '/profile/ve-history',
      icon: <Coins className="h-5 w-5 mr-3" />,
      label: 'VE History',
    },
  ]

  return (
    <div className="h-screen w-[250px] fixed left-0 top-0 flex flex-col bg-background z-[51]">
      <Link href="/" className="h-16 flex items-center px-6">
        <span className="font-bold text-primary text-2xl tracking-tight">
          onlora
        </span>
      </Link>
      <div className="flex-1 flex flex-col py-6 px-3">
        <nav className="space-y-1">
          {/* Main navigation items */}
          {navigationItems.map(
            (item) =>
              (!item.requireAuth || isLoggedIn) && (
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
              ),
          )}

          {/* Sign in button for non-logged in users */}
          {!isLoggedIn && (
            <Button
              onClick={handleGoogleSignIn}
              className="w-full mt-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl h-11"
            >
              Sign in to Create
            </Button>
          )}
        </nav>

        {/* Spacer to push the profile section to the bottom */}
        <div className="flex-1" />

        {/* Profile section for logged-in users */}
        {isLoggedIn && (
          <div className="mt-4">
            <button
              type="button"
              className="w-full px-4 py-3 rounded-xl hover:bg-muted/50 cursor-pointer text-left flex items-center justify-between"
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              aria-expanded={isProfileMenuOpen}
              aria-haspopup="true"
            >
              <div className="flex items-center space-x-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage
                    src={user.image ?? undefined}
                    alt={user.name ?? user.email ?? 'User'}
                  />
                  <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{user.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {user.email}
                  </span>
                </div>
              </div>
              {isProfileMenuOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {/* Profile dropdown menu */}
            {isProfileMenuOpen && (
              <div className="mt-2 py-2 px-1 bg-muted/30 rounded-xl">
                {profileItems.map((item) => (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={`flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all hover:bg-muted/50 ${
                      isActive(item.path)
                        ? 'text-primary bg-primary/5'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setIsProfileMenuOpen(false)}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </Link>
                ))}

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all hover:bg-muted/50 text-muted-foreground hover:text-foreground w-full"
                >
                  <LogOut className="h-5 w-5 mr-3" />
                  <span>Log out</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
