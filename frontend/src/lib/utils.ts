import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Helper to get initials from a name string
export const getInitials = (name?: string | null) => {
  if (!name) return '?'
  const names = name.split(' ')
  if (names.length === 1) {
    return names[0][0]?.toUpperCase() ?? '?'
  }
  if (names.length > 1) {
    return (names[0][0] + (names[names.length - 1][0] || '')).toUpperCase()
  }
  return '?' // Fallback for empty or unexpected name format
}
