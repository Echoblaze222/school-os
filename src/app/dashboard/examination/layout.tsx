// src/app/dashboard/examination/layout.tsx
// Same brand-injection pattern as teacher/layout.tsx. Access control
// itself lives in middleware.ts (outer floor) and getExamContext.ts
// (inner floor, called by every page below), this layout only handles
// per-school branding, it is not where the security check happens.
//
// Uses the shared getAuthedProfile() helper (src/lib/auth/
// getAuthedProfile.ts) instead of its own separate auth.getUser() +
// profile/school query - getExamContext() (called by every page below
// this layout) now uses the same helper, so the two dedupe against each
// other on the same request instead of each fetching independently.

import SchoolBrandInjector from '@/components/SchoolBrandInjector'
import { getAuthedProfile } from '@/lib/auth/getAuthedProfile'

export const dynamic    = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

export default async function ExaminationLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { school } = await getAuthedProfile()

  const primaryColor   = school?.primary_color   ?? '#800020'
  const secondaryColor = school?.secondary_color ?? undefined
  const fontFamily     = school?.font_family     ?? 'Inter'

  return (
    <>
      <SchoolBrandInjector primaryColor={primaryColor} secondaryColor={secondaryColor} fontFamily={fontFamily} />
      {children}
    </>
  )
}
