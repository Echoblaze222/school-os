'use client'
// src/app/dashboard/counselor/loading.tsx
// Instant placeholder for every counselor page while its data loads - see
// RouteLoading for why (keeps the Menu / AI dock on screen, no spinner).
import RouteLoading from '@/components/RouteLoading'
import { COUNSELOR_FEATURE_GROUPS } from './featureGroups'

export default function Loading() {
  return <RouteLoading role="counselor" groups={COUNSELOR_FEATURE_GROUPS} />
}
