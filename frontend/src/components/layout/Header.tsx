'use client'

import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function Header() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
      setSearchQuery('') // Clear input after search
    }
  }

  return (
    <header className="sticky top-0 z-50 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center px-6">
        <Link href="/" className="mr-6 flex items-center space-x-2">
          <span className="font-bold text-primary text-2xl tracking-tight">
            onlora
          </span>
        </Link>

        <div className="flex-1 flex items-center justify-center max-w-2xl mx-auto">
          <form onSubmit={handleSearchSubmit} className="w-full">
            <div className="relative group">
              <Input
                type="search"
                placeholder="Search for inspiration..."
                className="w-full pl-12 pr-4 py-2 h-11 bg-muted/30 hover:bg-muted/50 focus:bg-muted/50 border-0 rounded-2xl transition-colors"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground group-hover:text-foreground/80 transition-colors" />
            </div>
          </form>
        </div>
      </div>
    </header>
  )
}
