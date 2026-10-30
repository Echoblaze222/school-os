'use client'
// src/app/dashboard/student/loading.tsx
// Instant placeholder for every student page while its data loads - see
// RouteLoading for why (keeps the Menu / AI dock on screen, no spinner).
// The Home screen additionally shows the student's last-seen numbers from
// this phone when it has them (see StudentHomeSaved).
import { usePathname } from 'next/navigation'
import RouteLoading from '@/components/RouteLoading'
import { STUDENT_FEATURE_GROUPS } from './featureGroups'
import StudentHomeSaved from './StudentHomeSaved'

export default function Loading() {
  const pathname = usePathname()
  if (pathname === '/dashboard/student') return <StudentHomeSaved />
  return <RouteLoading role="student" groups={STUDENT_FEATURE_GROUPS} />
}
