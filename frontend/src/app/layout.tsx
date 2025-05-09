import Header from '@/components/layout/Header'
import Sidebar from '@/components/layout/Sidebar'
import { Toaster } from '@/components/ui/sonner'
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import Providers from './providers'
import './globals.css'

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
          <Header />
          <div className="flex min-h-[calc(100vh-4rem)]">
            <Sidebar />
            <main className="flex-1 ml-[250px] p-6 pb-20">
              <div className="max-w-7xl mx-auto">{children}</div>
            </main>
          </div>
          <footer className="py-6 text-sm text-center text-muted-foreground border-t ml-[250px]">
            <div className="container mx-auto px-6">
              © {new Date().getFullYear()} onlora.ai · All rights reserved
            </div>
          </footer>
          <Toaster position="top-center" />
        </Providers>
      </body>
    </html>
  )
}
