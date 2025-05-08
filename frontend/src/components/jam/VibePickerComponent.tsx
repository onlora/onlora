'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  type FeedApiResponse,
  type FeedPost,
  getTrendingFeed,
} from '@/lib/api/feedApi' // Import feed API
import { createJam } from '@/lib/api/jamApi'
import {
  type ProfilePostItem,
  type ProfilePostsPage,
  getMyPosts,
} from '@/lib/api/userApi' // Import user API for my posts
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

// Unified VibeItem type, compatible with FeedPostItem and ProfilePostItem for display purposes
interface VibeItem {
  id: number // Both have numeric ID
  title: string | null
  coverImg: string | null
  // Add other common fields if needed for display, or make them optional
}

export function VibePickerComponent() {
  const router = useRouter()
  const [isCreatingBlankJam, setIsCreatingBlankJam] = useState(false)

  const {
    data: trendingData,
    isLoading: isLoadingTrending,
    error: errorTrending,
  } = useQuery<FeedApiResponse, Error, VibeItem[]>({
    // Transform data to VibeItem[]
    queryKey: ['trendingVibesForPicker'],
    queryFn: () => getTrendingFeed(1, 12), // Fetch e.g., 12 trending vibes (page 1)
    select: (apiResponse: FeedApiResponse): VibeItem[] =>
      apiResponse.data.map((item: FeedPost) => ({
        // Assuming FeedPost type is available or define inline
        id: item.id,
        title: item.title,
        coverImg: item.coverImg,
      })),
  })

  const {
    data: myVibesData,
    isLoading: isLoadingMyVibes,
    error: errorMyVibes,
  } = useQuery<ProfilePostsPage, Error, VibeItem[]>({
    // Transform data to VibeItem[]
    queryKey: ['myPublicVibesForPicker'],
    queryFn: () => getMyPosts({ limit: 12, offset: 0 }, 'public'), // Fetch e.g., 12 of my public vibes
    select: (profilePage: ProfilePostsPage): VibeItem[] =>
      profilePage.items.map((item: ProfilePostItem) => ({
        // Explicitly type item
        id: item.id, // Ensure item.id is number, or Number(item.id) if it could be string
        title: item.title,
        coverImg: item.coverImg,
      })),
    enabled: true, // Assuming user is logged in due to ProtectedPage
  })

  const handleStartBlank = async () => {
    setIsCreatingBlankJam(true)
    try {
      const newJam = await createJam()
      toast.success('New Jam session created!')
      router.push(`/jam/${newJam.jamId}`)
    } catch (error) {
      console.error('Failed to create new Jam:', error)
      toast.error(`Error creating Jam: ${(error as Error).message}`)
      setIsCreatingBlankJam(false)
    }
  }

  const handleSelectVibe = (vibeId: number) => {
    // No need for loading state here as navigation is quick
    router.push(`/jam/new?remixSourcePostId=${vibeId}`)
  }

  const renderVibeList = (
    vibes: VibeItem[] | undefined,
    isLoading: boolean,
    error: Error | null,
    type: string,
  ) => {
    if (isLoading) {
      return (
        <div className="flex justify-center items-center h-32">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="ml-2 text-muted-foreground">
            Loading {type.toLowerCase()} vibes...
          </p>
        </div>
      )
    }
    if (error) {
      return (
        <div className="flex flex-col justify-center items-center h-32 text-destructive">
          <AlertTriangle className="h-8 w-8 mb-2" />
          <p>Could not load {type.toLowerCase()} vibes.</p>
          <p className="text-xs">{error.message}</p>
        </div>
      )
    }
    if (!vibes || vibes.length === 0) {
      return (
        <p className="text-muted-foreground py-4 text-center">
          No {type.toLowerCase()} vibes found to remix. Try starting blank!
        </p>
      )
    }
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {vibes.map((vibe) => (
          <Card
            key={vibe.id}
            className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow group"
            onClick={() => handleSelectVibe(vibe.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') handleSelectVibe(vibe.id)
            }}
            aria-label={`Remix Vibe: ${vibe.title || 'Untitled'}`}
          >
            <div className="aspect-square bg-muted flex items-center justify-center relative">
              {vibe.coverImg ? (
                <img
                  src={vibe.coverImg}
                  alt={vibe.title || 'Vibe image'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-sm text-muted-foreground">No Image</span>
              )}
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-white font-semibold">Remix</span>
              </div>
            </div>
            <CardHeader className="p-3">
              <CardTitle
                className="text-sm truncate"
                title={vibe.title || undefined}
              >
                {vibe.title || 'Untitled Vibe'}
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

      <Card className="mb-8 shadow-lg">
        <CardContent className="p-6 flex flex-col items-center">
          <h2 className="text-xl font-semibold mb-3">Start Fresh</h2>
          <p className="text-muted-foreground mb-4 text-center">
            Begin with a blank canvas and let your ideas flow.
          </p>
          <Button
            size="lg"
            onClick={handleStartBlank}
            disabled={isCreatingBlankJam}
            className="w-full max-w-xs"
          >
            {isCreatingBlankJam ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : (
              'Start Blank Jam'
            )}
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
              {renderVibeList(
                trendingData,
                isLoadingTrending,
                errorTrending,
                'Trending',
              )}
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
              {renderVibeList(
                myVibesData,
                isLoadingMyVibes,
                errorMyVibes,
                'My Public',
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
