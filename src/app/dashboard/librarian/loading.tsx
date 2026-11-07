'use client'
// src/app/dashboard/librarian/loading.tsx
// Instant placeholder for every librarian page while its data loads - see
// RouteLoading for why (keeps the Menu / AI dock on screen, no spinner).
// The Home screen additionally shows the last-seen headline numbers from
// this phone when it has them (see SavedHome).
import { usePathname } from 'next/navigation'
import RouteLoading from '@/components/RouteLoading'
import SavedHome from '@/components/savedView/SavedHome'
import { LIBRARIAN_FEATURE_GROUPS } from './featureGroups'

export default function Loading() {
  const pathname = usePathname()
  if (pathname === '/dashboard/librarian') return <SavedHome role="librarian" groups={LIBRARIAN_FEATURE_GROUPS} />
  return <RouteLoading role="librarian" groups={LIBRARIAN_FEATURE_GROUPS} />
}
