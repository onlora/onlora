'use client'

import ProtectedPage from '@/components/auth/ProtectedPage'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  type UpdateUserProfilePayload,
  type UserProfile,
  getMyProfile,
  updateUserProfile,
} from '@/lib/api/userApi'
import { useSession } from '@/lib/authClient'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

export default function EditProfilePage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: session } = useSession()

  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [bannerUrl, setBannerUrl] = useState('')
  const [imageUrl, setImageUrl] = useState('') // For avatar

  const { data: profile, isLoading: isLoadingProfile } = useQuery<
    UserProfile,
    Error
  >({
    queryKey: ['myProfile', session?.user?.id],
    queryFn: getMyProfile,
    enabled: !!session?.user?.id,
  })

  useEffect(() => {
    if (profile) {
      setName(profile.name || '')
      setBio(profile.bio || '')
      setBannerUrl(profile.bannerUrl || '')
      setImageUrl(profile.image || '')
    }
  }, [profile])

  const mutation = useMutation<UserProfile, Error, UpdateUserProfilePayload>({
    mutationFn: updateUserProfile,
    onSuccess: (updatedProfile) => {
      toast.success('Profile updated successfully!')
      queryClient.invalidateQueries({
        queryKey: ['myProfile', session?.user?.id],
      })
      queryClient.setQueryData(['myProfile', session?.user?.id], updatedProfile)
      router.push('/profile')
    },
    onError: (error) => {
      toast.error(`Failed to update profile: ${error.message}`)
    },
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const payload: UpdateUserProfilePayload = {}
    // Only include fields if they have changed from the original profile or are non-empty
    // This prevents sending empty strings for unchanged optional fields if the user clears them
    // but if they were null/undefined initially.
    // A more robust way is to compare with `profile` state.

    if (name !== (profile?.name || '')) payload.name = name || null
    if (bio !== (profile?.bio || '')) payload.bio = bio || null
    if (bannerUrl !== (profile?.bannerUrl || ''))
      payload.bannerUrl = bannerUrl || null
    if (imageUrl !== (profile?.image || '')) payload.image = imageUrl || null

    // Only mutate if there's something to update
    if (Object.keys(payload).length > 0) {
      mutation.mutate(payload)
    } else {
      toast.info('No changes to save.')
    }
  }

  const handleCancel = () => {
    router.back()
  }

  if (isLoadingProfile) {
    return (
      <ProtectedPage>
        <div className="container mx-auto p-4">
          Loading profile for editing...
        </div>
      </ProtectedPage>
    )
  }

  return (
    <ProtectedPage>
      <div className="container mx-auto max-w-2xl py-8">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link href="/profile">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Profile
          </Link>
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Edit Your Profile</CardTitle>
            <CardDescription>
              Update your personal information. Click save when you're done.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your display name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell us a little about yourself"
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="imageUrl">Avatar URL</Label>
                <Input
                  id="imageUrl"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://example.com/avatar.png"
                />
                <p className="text-xs text-muted-foreground">
                  Direct URL to your avatar image. File uploads coming soon.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bannerUrl">Banner URL</Label>
                <Input
                  id="bannerUrl"
                  value={bannerUrl}
                  onChange={(e) => setBannerUrl(e.target.value)}
                  placeholder="https://example.com/banner.png"
                />
                <p className="text-xs text-muted-foreground">
                  Direct URL to your banner image. File uploads coming soon.
                </p>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={mutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={mutation.isPending || isLoadingProfile}
              >
                {mutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </ProtectedPage>
  )
}
