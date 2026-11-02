'use client'
// src/app/dashboard/principal/loading.tsx
// Instant placeholder for every principal page while its data loads - see
// RouteLoading for why (keeps the Menu / AI dock on screen, no spinner).
// The Home screen additionally shows the last-seen headline numbers from
// this phone when it has them (see SavedHome).
import { usePathname } from 'next/navigation'
import RouteLoading from '@/components/RouteLoading'
import SavedHome from '@/components/savedView/SavedHome'
import { PRINCIPAL_FEATURE_GROUPS } from './featureGroups'

export default function Loading() {
  const pathname = usePathname()
  if (pathname === '/dashboard/principal') return <SavedHome role="principal" groups={PRINCIPAL_FEATURE_GROUPS} />
  return <RouteLoading role="principal" groups={PRINCIPAL_FEATURE_GROUPS} />
}
