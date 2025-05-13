'use client'

import { Button } from '@/components/ui/button'
import {
  type FeedApiResponse,
  type FeedPost,
  getTrendingFeed,
} from '@/lib/api/feedApi'
import { createJam } from '@/lib/api/jamApi'
import {
  type ProfilePostItem,
  type ProfilePostsPage,
  getMyPosts,
} from '@/lib/api/userApi'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  Flame,
  FolderHeart,
  Loader2,
  Plus,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

// Unified VibeItem type, compatible with FeedPostItem and ProfilePostItem for display purposes
interface VibeItem {
  id: number
  title: string | null
  coverImg: string | null
}

export function VibePickerComponent() {
  const router = useRouter()
  const [isCreatingBlankJam, setIsCreatingBlankJam] = useState(false)
  const [activeTab, setActiveTab] = useState<'trending' | 'my-vibes'>(
    'trending',
  )

  const {
    data: trendingData,
    isLoading: isLoadingTrending,
    error: errorTrending,
  } = useQuery<FeedApiResponse, Error, VibeItem[]>({
    queryKey: ['trendingVibesForPicker'],
    queryFn: () => getTrendingFeed(1, 12),
    select: (apiResponse: FeedApiResponse): VibeItem[] =>
      apiResponse.data.map((item: FeedPost) => ({
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
    queryKey: ['myPublicVibesForPicker'],
    queryFn: () => getMyPosts({ limit: 12, offset: 0 }, 'public'),
    select: (profilePage: ProfilePostsPage): VibeItem[] =>
      profilePage.items.map((item: ProfilePostItem) => ({
        id: item.id,
        title: item.title,
        coverImg: item.coverImg,
      })),
    enabled: true,
  })

  const handleStartBlank = async () => {
    setIsCreatingBlankJam(true)
    try {
      const newJam = await createJam()
      toast.success('New Jam created!')
      router.push(`/jam/${newJam.jamId}`)
    } catch (error) {
      console.error('Failed to create new Jam:', error)
      toast.error(`Error creating Jam: ${(error as Error).message}`)
      setIsCreatingBlankJam(false)
    }
  }

  const handleSelectVibe = (vibeId: number) => {
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
        <div className="flex justify-center items-center h-40">
          <Loader2 className="h-6 w-6 animate-spin text-primary/60" />
          <p className="ml-2 text-muted-foreground">
            Loading {type.toLowerCase()} vibes...
          </p>
        </div>
      )
    }

    if (error) {
      return (
        <div className="flex flex-col justify-center items-center h-40 text-destructive/80">
          <AlertTriangle className="h-6 w-6 mb-2" />
          <p>Could not load {type.toLowerCase()} vibes.</p>
          <p className="text-xs">{error.message}</p>
        </div>
      )
    }

    if (!vibes || vibes.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 px-4">
          <p className="text-muted-foreground text-center mb-6">
            No {type.toLowerCase()} vibes found to remix.
          </p>
          <Button
            onClick={handleStartBlank}
            variant="outline"
            className="rounded-full px-6"
          >
            Start with a blank canvas
          </Button>
        </div>
      )
    }

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 p-6">
        {vibes.map((vibe) => (
          <button
            key={vibe.id}
            type="button"
            className="aspect-square relative overflow-hidden rounded-2xl cursor-pointer hover:shadow-lg transition-all group p-0 border-0"
            onClick={() => handleSelectVibe(vibe.id)}
            aria-label={`Remix Vibe: ${vibe.title || 'Untitled'}`}
          >
            {vibe.coverImg ? (
              <img
                src={vibe.coverImg}
                alt={vibe.title || 'Vibe image'}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-muted/30 flex items-center justify-center">
                <span className="text-sm text-muted-foreground">No Image</span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-4 flex flex-col justify-end opacity-90 group-hover:opacity-100 transition-opacity">
              <p className="text-white font-medium text-sm line-clamp-1">
                {vibe.title || 'Untitled Vibe'}
              </p>
              <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full rounded-full"
                >
                  <span>Remix</span>
                  <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="w-full flex flex-col rounded-xl bg-background">
      <div className="flex-shrink-0 py-8 text-center">
        <h1 className="text-3xl font-medium">Start a New Jam</h1>
        <p className="text-muted-foreground mt-2">
          Choose a starting point for your creation
        </p>
      </div>

      <div className="flex-grow overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-8 py-4 mb-4">
          <div className="flex gap-3">
            <button
              onClick={() => setActiveTab('trending')}
              className={`flex items-center px-6 py-2.5 rounded-full text-sm transition-all ${
                activeTab === 'trending'
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted/40'
              }`}
              type="button"
            >
              <Flame
                className={`h-4 w-4 ${activeTab === 'trending' ? 'text-primary' : 'text-muted-foreground'} mr-2`}
              />
              Trending Vibes
            </button>
            <button
              onClick={() => setActiveTab('my-vibes')}
              className={`flex items-center px-6 py-2.5 rounded-full text-sm transition-all ${
                activeTab === 'my-vibes'
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted/40'
              }`}
              type="button"
            >
              <FolderHeart
                className={`h-4 w-4 ${activeTab === 'my-vibes' ? 'text-primary' : 'text-muted-foreground'} mr-2`}
              />
              My Vibes
            </button>
          </div>

          <Button
            onClick={handleStartBlank}
            disabled={isCreatingBlankJam}
            className="rounded-full px-6"
          >
            {isCreatingBlankJam ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Start Blank
              </>
            )}
          </Button>
        </div>

        <div className="flex-grow overflow-y-auto px-2">
          {activeTab === 'trending' &&
            renderVibeList(
              trendingData,
              isLoadingTrending,
              errorTrending,
              'Trending',
            )}

          {activeTab === 'my-vibes' &&
            renderVibeList(
              myVibesData,
              isLoadingMyVibes,
              errorMyVibes,
              'My Public',
            )}
        </div>
      </div>
    </div>
  )
}
