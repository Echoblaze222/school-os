'use client'
// src/app/dashboard/bursar/loading.tsx
// Instant placeholder for every bursar page while its data loads - see
// RouteLoading for why (keeps the Menu / AI dock on screen, no spinner).
import RouteLoading from '@/components/RouteLoading'
import { BURSAR_FEATURE_GROUPS } from './featureGroups'

export default function Loading() {
  return <RouteLoading role="bursar" groups={BURSAR_FEATURE_GROUPS} />
}
