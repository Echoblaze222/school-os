'use client'
// src/app/dashboard/examination/loading.tsx
// Instant placeholder for every examination page while its data loads - see
// RouteLoading for why (keeps the Menu / AI dock on screen, no spinner).
import RouteLoading from '@/components/RouteLoading'
import { EXAMINATION_FEATURE_GROUPS } from './featureGroups'

export default function Loading() {
  return <RouteLoading role="examination" groups={EXAMINATION_FEATURE_GROUPS} />
}
