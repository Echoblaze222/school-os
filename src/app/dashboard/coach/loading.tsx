'use client'
// src/app/dashboard/coach/loading.tsx
// Instant placeholder for every coach page while its data loads - see
// RouteLoading for why (keeps the Menu / AI dock on screen, no spinner).
import RouteLoading from '@/components/RouteLoading'
import { COACH_FEATURE_GROUPS } from './featureGroups'

export default function Loading() {
  return <RouteLoading role="coach" groups={COACH_FEATURE_GROUPS} />
}
