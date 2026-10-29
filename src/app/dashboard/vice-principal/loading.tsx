'use client'
// src/app/dashboard/vice-principal/loading.tsx
// Instant placeholder for every vice-principal page while its data loads - see
// RouteLoading for why (keeps the Menu / AI dock on screen, no spinner).
import RouteLoading from '@/components/RouteLoading'
import { VP_FEATURE_GROUPS } from './featureGroups'

export default function Loading() {
  return <RouteLoading role="vice-principal" groups={VP_FEATURE_GROUPS} />
}
