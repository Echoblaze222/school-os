// src/app/dashboard/vice-principal/layout.tsx
// Injects the school's brand colours + font as CSS variables on <html>
// before first paint - same pattern as every other role layout (see
// dashboard/principal/layout.tsx). Auth and appointment verification
// happen per-page via requireAppointmentPage('vice_principal'), not here -
// see docs/phase1-foundation/06-SECURITY-NOTES.md on why a layout-only
// check is not sufficient on its own.
//
// Uses the shared getAuthedProfile() helper (src/lib/auth/
// getAuthedProfile.ts) instead of its own separate auth.getUser() +
// profile/school query - vice-principal/page.tsx below this layout
// independently re-fetched the exact same profile+schools(*) row on
// every navigation. NOTE: requireAppointmentPage() (lib/permissions.ts)
// still does its own separate, narrower profile lookup internally
// (role/school_id only, for appointment resolution) - left as-is here
// rather than refactored, since that's a security-critical function
// shared across many roles' access checks and deserves its own careful,
// isolated change rather than a side effect of this pass.

import SchoolBrandInjector from '@/components/SchoolBrandInjector'
import { getAuthedProfile } from '@/lib/auth/getAuthedProfile'

export const dynamic    = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

export default async function VicePrincipalLayout({
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
