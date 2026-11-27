'use client'
// src/app/dashboard/hostel/loading.tsx
// Instant placeholder for every hostel page while its data loads - see
// RouteLoading for why (keeps the Menu / AI dock on screen, no spinner).
import RouteLoading from '@/components/RouteLoading'
import { HOSTEL_FEATURE_GROUPS } from './featureGroups'

export default function Loading() {
  return <RouteLoading role="hostel" groups={HOSTEL_FEATURE_GROUPS} />
}
