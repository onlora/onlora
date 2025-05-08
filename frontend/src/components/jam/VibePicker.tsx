'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createJam } from '@/lib/api/jamApi'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

// Placeholder type for a Vibe item (adjust as per actual data structure)
interface VibeItem {
  id: string | number
  title: string
  coverImg: string | null
}

export function VibePickerComponent() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  // Placeholder data - replace with actual API calls using React Query
  const trendingVibes: VibeItem[] = [
    // { id: 't1', title: 'Trending Vibe 1', coverImg: 'https://via.placeholder.com/150' },
  ]
  const myVibes: VibeItem[] = [
    // { id: 'm1', title: 'My Vibe 1', coverImg: 'https://via.placeholder.com/150' },
  ]

  const handleStartBlank = async () => {
    setIsLoading(true)
    try {
      const newJam = await createJam()
      toast.success('New Jam session created!')
      router.push(`/jam/${newJam.jamId}`)
    } catch (error) {
      console.error('Failed to create new Jam:', error)
      toast.error(`Error creating Jam: ${(error as Error).message}`)
      setIsLoading(false)
    }
    // No need to setIsLoading(false) on success due to navigation
  }

  const handleSelectVibe = (vibeId: string | number) => {
    setIsLoading(true)
    // Navigate to /jam/new with remixSourcePostId. The JamPage will handle creation.
    router.push(`/jam/new?remixSourcePostId=${vibeId}`)
  }

  const renderVibeList = (vibes: VibeItem[], type: string) => {
    if (vibes.length === 0) {
      return (
        <p className="text-muted-foreground">
          No {type.toLowerCase()} vibes found.
        </p>
      )
    }
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {vibes.map((vibe) => (
          <Card
            key={vibe.id}
            className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => handleSelectVibe(vibe.id)}
          >
            <div className="aspect-square bg-muted flex items-center justify-center">
              {vibe.coverImg ? (
                <img
                  src={vibe.coverImg}
                  alt={vibe.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-sm text-muted-foreground">No Image</span>
              )}
            </div>
            <CardHeader className="p-3">
              <CardTitle className="text-sm truncate" title={vibe.title}>
                {vibe.title}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-4xl py-8">
      <h1 className="text-3xl font-bold mb-2 text-center">Start a New Jam</h1>
      <p className="text-muted-foreground text-center mb-8">
        Choose a starting point for your creation.
      </p>

      <Card className="mb-8">
        <CardContent className="p-6 flex flex-col items-center">
          <h2 className="text-xl font-semibold mb-3">Start Fresh</h2>
          <p className="text-muted-foreground mb-4 text-center">
            Begin with a blank canvas and let your ideas flow.
          </p>
          <Button
            size="lg"
            onClick={handleStartBlank}
            disabled={isLoading}
            className="w-full max-w-xs"
          >
            {isLoading ? 'Starting...' : 'Start Blank Jam'}
          </Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="trending">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="trending">🔥 Trending Vibes</TabsTrigger>
          <TabsTrigger value="my-vibes">🖼️ My Public Vibes</TabsTrigger>
        </TabsList>
        <TabsContent value="trending">
          <Card>
            <CardHeader>
              <CardTitle>Remix a Trending Vibe</CardTitle>
              <p className="text-sm text-muted-foreground pt-1">
                Get inspired by what's popular. Pick a vibe to remix and make it
                your own.
              </p>
            </CardHeader>
            <CardContent>
              {/* TODO: Implement actual fetching and loading state for trending vibes */}
              {trendingVibes.length === 0 && !isLoading && (
                <p className="text-muted-foreground py-4 text-center">
                  No trending vibes available right now. Try starting blank!
                </p>
              )}
              {isLoading && <p>Loading trending vibes...</p>}{' '}
              {/* Replace with Skeleton */}
              {!isLoading && renderVibeList(trendingVibes, 'Trending')}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="my-vibes">
          <Card>
            <CardHeader>
              <CardTitle>Remix One of Your Vibes</CardTitle>
              <p className="text-sm text-muted-foreground pt-1">
                Revisit and build upon your previous public creations.
              </p>
            </CardHeader>
            <CardContent>
              {/* TODO: Implement actual fetching and loading state for my vibes */}
              {myVibes.length === 0 && !isLoading && (
                <p className="text-muted-foreground py-4 text-center">
                  You haven't published any public vibes yet. Try starting
                  blank!
                </p>
              )}
              {isLoading && <p>Loading your vibes...</p>}{' '}
              {/* Replace with Skeleton */}
              {!isLoading && renderVibeList(myVibes, 'My Public')}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
