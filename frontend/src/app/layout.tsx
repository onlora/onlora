import Sidebar from '@/components/layout/Sidebar'
import { Toaster } from '@/components/ui/sonner'
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import Providers from './providers'
import './globals.css'
import { HideHeader } from '@/components/layout/HideHeader'
import MainContent from '@/components/layout/MainContent'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'onlora.ai',
  description: 'AI Generated Vibes',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background`}
      >
        <Providers>
          <HideHeader />
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1">
              <MainContent>{children}</MainContent>
            </main>
          </div>
          <Toaster position="top-right" />
        </Providers>
      </body>
    </html>
  )
}
