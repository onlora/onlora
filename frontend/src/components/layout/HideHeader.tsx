'use client'

import { usePathname } from 'next/navigation'
import Header from './Header'

export function HideHeader() {
  const pathname = usePathname()
  const isJamPage = pathname.startsWith('/jam')

  if (isJamPage) {
    return null
  }

  return <Header />
}
