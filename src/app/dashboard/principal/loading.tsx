'use client'
// src/app/dashboard/principal/loading.tsx
// Instant placeholder for every principal page while its data loads - see
// RouteLoading for why (keeps the Menu / AI dock on screen, no spinner).
import RouteLoading from '@/components/RouteLoading'
import { PRINCIPAL_FEATURE_GROUPS } from './featureGroups'

export default function Loading() {
  return <RouteLoading role="principal" groups={PRINCIPAL_FEATURE_GROUPS} />
}
