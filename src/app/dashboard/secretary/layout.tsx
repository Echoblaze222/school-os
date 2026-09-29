// src/app/dashboard/secretary/layout.tsx
// Injects the school's brand colours + font as CSS variables on <html>
// before first paint — covers every sub-page with zero client-component changes.
//
// Uses the shared getAuthedProfile() helper (src/lib/auth/
// getAuthedProfile.ts) instead of its own separate auth.getUser() +
// profile/school query - secretary/page.tsx below this layout needs the
// exact same data and was independently re-fetching it on every
// navigation.

import SchoolBrandInjector from '@/components/SchoolBrandInjector'
import { getAuthedProfile } from '@/lib/auth/getAuthedProfile'

export const dynamic    = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

export default async function SecretaryLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { school } = await getAuthedProfile()

  const primaryColor   = school?.primary_color   ?? '#7C3AED'
  const secondaryColor = school?.secondary_color ?? undefined
  const fontFamily     = school?.font_family     ?? 'Inter'

  return (
    <>
      <SchoolBrandInjector primaryColor={primaryColor} secondaryColor={secondaryColor} fontFamily={fontFamily} />
      {children}
    </>
  )
}
