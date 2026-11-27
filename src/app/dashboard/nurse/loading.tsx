'use client'
// src/app/dashboard/nurse/loading.tsx
// Instant placeholder for every nurse page while its data loads - see
// RouteLoading for why (keeps the Menu / AI dock on screen, no spinner).
import RouteLoading from '@/components/RouteLoading'
import { NURSE_FEATURE_GROUPS } from './featureGroups'

export default function Loading() {
  return <RouteLoading role="nurse" groups={NURSE_FEATURE_GROUPS} />
}
