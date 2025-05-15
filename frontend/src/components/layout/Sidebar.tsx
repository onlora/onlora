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
  Menu,
  Plus,
  User,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createContext, useContext, useEffect, useState } from 'react'

// Create a context to share sidebar state
export const SidebarContext = createContext<{ isMobile: boolean }>({
  isMobile: false,
})

// Hook to use sidebar context
export const useSidebar = () => useContext(SidebarContext)

export default function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const user = session?.user
  const isLoggedIn = !!user
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 0,
  )

  // Check window width on mount and resize
  useEffect(() => {
    const updateWidth = () => {
      setWindowWidth(window.innerWidth)
    }

    // Set initial width
    if (typeof window !== 'undefined') {
      updateWidth()
    }

    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  // Close mobile menu on navigation
  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [pathname])

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

  // Determine if we're on a mobile device
  const isMobile = windowWidth > 0 && windowWidth < 768

  // Navigation items with corresponding paths, icons and labels
  const navigationItems = [
    {
      path: '/',
      icon: <Home className="h-5 w-5" />,
      label: 'Discover',
    },
    {
      path: '/jam/new',
      icon: <Plus className="h-5 w-5" />,
      label: 'Create',
      requireAuth: true,
    },
    {
      path: '/notifications',
      icon: <Bell className="h-5 w-5" />,
      label: 'Notifications',
      requireAuth: true,
    },
  ]

  const profileItems = [
    {
      path: '/profile',
      icon: <User className="h-5 w-5" />,
      label: 'Profile',
    },
    {
      path: '/gallery',
      icon: <LayoutGrid className="h-5 w-5" />,
      label: 'My Gallery',
    },
    {
      path: '/profile/bookmarks',
      icon: <Bookmark className="h-5 w-5" />,
      label: 'Bookmarks',
    },
    {
      path: '/profile/ve-history',
      icon: <Coins className="h-5 w-5" />,
      label: 'VE History',
    },
  ]

  // Render the main navigation items
  const renderNavigationItems = () => (
    <>
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
              <span className="mr-3">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ),
      )}

      {/* Sign in button for non-logged in users */}
      {!isLoggedIn && (
        <Button
          type="button"
          onClick={handleGoogleSignIn}
          className="w-full mt-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl h-11"
        >
          Sign in to Create
        </Button>
      )}
    </>
  )

  // Render profile section
  const renderProfileSection = () =>
    isLoggedIn && (
      <div className="mt-4">
        <button
          type="button"
          className="w-full px-4 py-3 rounded-xl hover:bg-muted/80 active:bg-muted cursor-pointer text-left flex items-center justify-between transition-all"
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
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </button>

        {/* Profile dropdown menu */}
        {isProfileMenuOpen && (
          <div className="mt-2 py-2 px-1 bg-muted/30 rounded-xl">
            {profileItems.map((item) => (
              <Link
                key={item.path}
                href={item.path}
                className={`flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all hover:bg-muted/50 active:bg-muted ${
                  isActive(item.path)
                    ? 'text-primary bg-primary/5'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setIsProfileMenuOpen(false)}
              >
                <span className="mr-3">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}

            <button
              type="button"
              onClick={handleSignOut}
              className="flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all hover:bg-muted/50 active:bg-muted text-muted-foreground hover:text-foreground w-full"
            >
              <LogOut className="h-5 w-5 mr-3" />
              <span>Log out</span>
            </button>
          </div>
        )}
      </div>
    )

  // Add a style to push content when sidebar is visible
  useEffect(() => {
    if (typeof document !== 'undefined') {
      // Add a style for desktop sidebar spacing
      const style = document.createElement('style')
      style.innerHTML = `
        @media (min-width: 768px) {
          main {
            margin-left: 250px;
            transition: margin-left 0.3s ease;
          }
        }
        @media (max-width: 767px) {
          main {
            margin-left: 0;
            transition: margin-left 0.3s ease;
          }
        }
      `
      document.head.appendChild(style)

      return () => {
        document.head.removeChild(style)
      }
    }
  }, [])

  return (
    <SidebarContext.Provider value={{ isMobile }}>
      {/* Mobile header */}
      {isMobile && (
        <div className="fixed top-0 left-0 right-0 h-16 bg-background z-[52] flex items-center justify-between px-4">
          <Link
            href="/"
            className="font-bold text-primary text-2xl tracking-tight"
          >
            onlora
          </Link>
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 rounded-lg hover:bg-muted/50"
          >
            {isMobileMenuOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </button>
        </div>
      )}

      {/* Desktop sidebar - always visible on desktop */}
      {!isMobile && (
        <div className="h-screen w-[250px] fixed left-0 top-0 flex flex-col bg-background z-[51]">
          <Link href="/" className="h-16 flex items-center px-6">
            <span className="font-bold text-primary text-2xl tracking-tight">
              onlora
            </span>
          </Link>
          <div className="flex-1 flex flex-col py-6 px-3">
            <nav className="space-y-1">{renderNavigationItems()}</nav>
            <div className="flex-1" />
            {renderProfileSection()}
          </div>
        </div>
      )}

      {/* Mobile slide-out menu */}
      {isMobile && (
        <>
          {/* Overlay */}
          {isMobileMenuOpen && (
            <div
              className="fixed inset-0 bg-black/50 z-[53]"
              onClick={() => setIsMobileMenuOpen(false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setIsMobileMenuOpen(false)
              }}
              role="button"
              tabIndex={0}
              aria-label="Close menu"
            />
          )}

          {/* Sidebar */}
          <div
            className={`fixed top-0 left-0 bottom-0 w-[250px] bg-background z-[54] pt-16 transition-transform duration-300 ${
              isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            <div className="flex-1 flex flex-col py-6 px-3 h-full">
              <nav className="space-y-1">{renderNavigationItems()}</nav>
              <div className="flex-1" />
              {renderProfileSection()}
            </div>
          </div>
        </>
      )}
    </SidebarContext.Provider>
  )
}
