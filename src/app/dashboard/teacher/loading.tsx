'use client'
// src/app/dashboard/teacher/loading.tsx
// Instant placeholder for every teacher page while its data loads - see
// RouteLoading for why (keeps the Menu / AI dock on screen, no spinner).
// The Home screen additionally shows the last-seen headline numbers from
// this phone when it has them (see SavedHome).
import { usePathname } from 'next/navigation'
import RouteLoading from '@/components/RouteLoading'
import SavedHome from '@/components/savedView/SavedHome'
import { TEACHER_FEATURE_GROUPS } from './featureGroups'

export default function Loading() {
  const pathname = usePathname()
  if (pathname === '/dashboard/teacher') return <SavedHome role="teacher" groups={TEACHER_FEATURE_GROUPS} />
  return <RouteLoading role="teacher" groups={TEACHER_FEATURE_GROUPS} />
}
