'use client'
// src/app/dashboard/teacher/loading.tsx
// Instant placeholder for every teacher page while its data loads - see
// RouteLoading for why (keeps the Menu / AI dock on screen, no spinner).
import RouteLoading from '@/components/RouteLoading'
import { TEACHER_FEATURE_GROUPS } from './featureGroups'

export default function Loading() {
  return <RouteLoading role="teacher" groups={TEACHER_FEATURE_GROUPS} />
}
