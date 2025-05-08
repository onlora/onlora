'use client'

import ProtectedPage from '@/components/auth/ProtectedPage'
import { VibePickerComponent } from '@/components/jam/VibePickerComponent'

export default function NewJamPage() {
  return (
    <ProtectedPage>
      <VibePickerComponent />
    </ProtectedPage>
  )
}
