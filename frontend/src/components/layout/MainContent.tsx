'use client'

import { usePathname } from 'next/navigation'
import type React from 'react'

export default function MainContent({
  children,
}: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isJamPage = pathname.startsWith('/jam')

  // Apply pt-0 for /jam pages to remove the extra top space.
  // For other pages, apply pt-6.
  // pb-6 (bottom padding) and px-6 (horizontal padding) remain consistent.
  const paddingTopClass = isJamPage ? 'pt-0' : 'pt-6'
  const paddingBottomClass = isJamPage ? 'pb-0' : 'pb-6'

  return (
    <div
      className={`max-w-7xl mx-auto px-6 ${paddingTopClass} ${paddingBottomClass}`}
    >
      {children}
    </div>
  )
}
