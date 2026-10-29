'use client'
// src/app/dashboard/secretary/loading.tsx
// Instant placeholder for every secretary page while its data loads - see
// RouteLoading for why (keeps the Menu / AI dock on screen, no spinner).
import RouteLoading from '@/components/RouteLoading'
import { SECRETARY_FEATURE_GROUPS } from './featureGroups'

export default function Loading() {
  return <RouteLoading role="secretary" groups={SECRETARY_FEATURE_GROUPS} />
}
