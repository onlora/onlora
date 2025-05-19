'use client'

import { SignInButton } from '@/components/auth/SignInButton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { CheckInButton } from '@/components/ui/check-in-button'
import { useSession } from '@/lib/authClient'
import { signOutWithLens } from '@/lib/authClient'
import { getInitials } from '@/lib/utils'
import {
  Bell,
  Bookmark,
  Calendar,
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
  }, [])

  // Check if the given path is active
  const isActive = (path: string) => {
    if (path === '/' && pathname === '/') return true
    if (path !== '/' && pathname.startsWith(path)) return true
    return false
  }

  // Handle sign out
  const handleSignOut = async () => {
    try {
      await signOutWithLens()

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
      path: user ? `/u/${user.id}` : '/',
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
    // Add CheckInButton as a special item that renders button instead of Link
    {
      type: 'button',
      icon: <Calendar className="h-5 w-5" />,
      component: <CheckInButton />,
      requireAuth: true,
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
        <div className="mt-2">
          <SignInButton />
        </div>
      )}
    </>
  )

  // Render profile section
  const renderProfileSection = () =>
    isLoggedIn && (
      <div className="mt-4">
        <button
          type="button"
          className="w-full px-4 py-3 rounded-xl hover:bg-muted/80 active:bg-muted cursor-pointer text-left flex items-center transition-all"
          onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
          aria-expanded={isProfileMenuOpen}
          aria-haspopup="true"
        >
          <div className="flex items-center space-x-3">
            <Avatar className="h-10 w-10">
              <AvatarImage
                src={typeof user?.image === 'string' ? user.image : ''}
                alt={typeof user?.name === 'string' ? user.name : 'User'}
              />
              <AvatarFallback>
                {getInitials(typeof user?.name === 'string' ? user.name : '')}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium">
              {typeof user?.name === 'string' ? user.name : 'User'}
            </span>
          </div>
        </button>

        {isProfileMenuOpen && (
          <div className="mt-2 py-2 px-1 bg-muted/30 rounded-xl">
            {profileItems.map((item) => {
              // Special handling for button type items like CheckInButton
              if (item.type === 'button') {
                return (
                  (!item.requireAuth || isLoggedIn) && (
                    <div
                      key={`btn-${Math.random().toString(36).slice(2, 7)}`}
                      className="px-4 py-2"
                    >
                      {item.component}
                    </div>
                  )
                )
              }

              // Normal link items - safely cast to link type
              const linkItem = item as {
                path: string
                icon: React.ReactNode
                label: string
              }
              return (
                <Link
                  key={linkItem.path}
                  href={linkItem.path}
                  className={`flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all hover:bg-muted/50 active:bg-muted ${
                    isActive(linkItem.path)
                      ? 'text-primary bg-primary/5'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setIsProfileMenuOpen(false)}
                >
                  <span className="mr-3">{linkItem.icon}</span>
                  <span>{linkItem.label}</span>
                </Link>
              )
            })}

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
