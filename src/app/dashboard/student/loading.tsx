'use client'
// src/app/dashboard/student/loading.tsx
// Instant placeholder for every student page while its data loads - see
// RouteLoading for why (keeps the Menu / AI dock on screen, no spinner).
import RouteLoading from '@/components/RouteLoading'
import { STUDENT_FEATURE_GROUPS } from './featureGroups'

export default function Loading() {
  return <RouteLoading role="student" groups={STUDENT_FEATURE_GROUPS} />
}
