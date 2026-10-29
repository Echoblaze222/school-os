'use client'
// src/app/dashboard/ict/loading.tsx
// Instant placeholder for every ict page while its data loads - see
// RouteLoading for why (keeps the Menu / AI dock on screen, no spinner).
import RouteLoading from '@/components/RouteLoading'
import { ICT_FEATURE_GROUPS } from './featureGroups'

export default function Loading() {
  return <RouteLoading role="ict" groups={ICT_FEATURE_GROUPS} />
}
