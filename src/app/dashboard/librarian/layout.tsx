// src/app/dashboard/librarian/layout.tsx
// Mirrors counselor/layout.tsx and ict/layout.tsx: injects the school's
// brand colors + font as CSS variables on <html> before first paint,
// covering every librarian sub-page with zero client-component changes.
//
// Uses the shared getAuthedProfile() helper (src/lib/auth/
// getAuthedProfile.ts) instead of its own separate auth.getUser() +
// profile/school query - librarian/page.tsx below this layout needs the
// exact same data and was independently re-fetching it on every
// navigation.

import SchoolBrandInjector from '@/components/SchoolBrandInjector'
import { getAuthedProfile } from '@/lib/auth/getAuthedProfile'

export const dynamic    = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

export default async function LibrarianLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { school } = await getAuthedProfile()

  const primaryColor   = school?.primary_color   ?? '#00B4D8'
  const secondaryColor = school?.secondary_color ?? '#800020'
  const fontFamily     = school?.font_family     ?? 'Inter'

  return (
    <>
      <SchoolBrandInjector primaryColor={primaryColor} secondaryColor={secondaryColor} fontFamily={fontFamily} />
      {children}
    </>
  )
}
