'use client'
// src/app/dashboard/librarian/loading.tsx
// Instant placeholder for every librarian page while its data loads - see
// RouteLoading for why (keeps the Menu / AI dock on screen, no spinner).
import RouteLoading from '@/components/RouteLoading'
import { LIBRARIAN_FEATURE_GROUPS } from './featureGroups'

export default function Loading() {
  return <RouteLoading role="librarian" groups={LIBRARIAN_FEATURE_GROUPS} />
}
