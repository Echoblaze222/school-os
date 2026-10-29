'use client'
// src/app/dashboard/parent/loading.tsx
// Instant placeholder for every parent page while its data loads - see
// RouteLoading for why (keeps the Menu / AI dock on screen, no spinner).
import RouteLoading from '@/components/RouteLoading'
import { PARENT_FEATURE_GROUPS } from './featureGroups'

export default function Loading() {
  return <RouteLoading role="parent" groups={PARENT_FEATURE_GROUPS} />
}
