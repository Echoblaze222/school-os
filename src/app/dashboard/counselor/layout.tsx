// src/app/dashboard/counselor/layout.tsx
// Injects the school's brand colors + font as CSS variables on <html>
// before first paint, covering every counselor sub-page with zero
// client-component changes. Mirrors the pattern used by every other role
// layout (see bursar/layout.tsx).
//
// Note: the fallback default here is SchoolOS's actual brand cyan
// (#00B4D8), used only when a school hasn't set its own primary_color yet.
// Some other role layouts still fall back to a stale pre-brand violet
// (#7C3AED) left over from before the brand correction; not touched here
// since that's outside this file's scope, but worth a follow-up pass.
//
// Uses the shared getAuthedProfile() helper (src/lib/auth/
// getAuthedProfile.ts) instead of its own separate auth.getUser() +
// profile/school query - counselor/page.tsx below this layout needs the
// exact same data and was independently re-fetching it on every
// navigation.

import SchoolBrandInjector from '@/components/SchoolBrandInjector'
import { getAuthedProfile } from '@/lib/auth/getAuthedProfile'

export const dynamic    = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

export default async function CounselorLayout({
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
