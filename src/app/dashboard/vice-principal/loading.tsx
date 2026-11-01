'use client'
// src/app/dashboard/vice-principal/loading.tsx
// Instant placeholder for every vice-principal page while its data loads - see
// RouteLoading for why (keeps the Menu / AI dock on screen, no spinner).
// The Home screen additionally shows the last-seen headline numbers from
// this phone when it has them (see SavedHome).
import { usePathname } from 'next/navigation'
import RouteLoading from '@/components/RouteLoading'
import SavedHome from '@/components/savedView/SavedHome'
import { VP_FEATURE_GROUPS } from './featureGroups'

export default function Loading() {
  const pathname = usePathname()
  if (pathname === '/dashboard/vice-principal') return <SavedHome role="vice-principal" groups={VP_FEATURE_GROUPS} />
  return <RouteLoading role="vice-principal" groups={VP_FEATURE_GROUPS} />
}
