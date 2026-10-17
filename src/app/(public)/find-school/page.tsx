// src/app/(public)/find-school/page.tsx
// Public platform (Phase 4, Lane C) - §40 student/parent admission discovery.
// Unauthenticated by design. Full school-profile browsing (ratings,
// programs, photos) is Lane B's scope - this shows just enough
// (name, location, admission fee/deadline) to get someone to "Apply".

import type { Metadata } from 'next'
import FindSchoolClient from './FindSchoolClient'
import { pageMetadata } from '@/lib/seo'

export const metadata: Metadata = pageMetadata({
  title: 'Find a School & Apply',
  description: 'Browse Nigerian schools with open admissions — name, location, fees, and deadlines — and apply directly on SchoolOS.',
  path: '/find-school',
})

export default function FindSchoolPage() {
  return <FindSchoolClient />
}
