// src/app/dashboard/teacher/layout.tsx
// Injects the school's brand colours + font as CSS variables on <html>
// before first paint - covers every sub-page with zero client-component changes.
//
// primary_color, secondary_color, and font_family all live directly on the
// `schools` table (added via the schools-branding-columns migration - see
// src/lib/supabase/types.ts).
//
// Uses the shared getAuthedProfile() helper (src/lib/auth/
// getAuthedProfile.ts) instead of its own separate auth.getUser() +
// profile/school query - teacher/page.tsx below this layout needs the
// exact same data and was independently re-fetching it on every
// navigation. getAuthedProfile is wrapped in React's cache(), so calling
// it here AND in the page below only does the actual Supabase work once
// per request.

import SchoolBrandInjector from '@/components/SchoolBrandInjector'
import { getAuthedProfile } from '@/lib/auth/getAuthedProfile'

// Force fully dynamic, per-request rendering with no caching of any kind.
// This layout reads the signed-in user's school (brand colours, role data)
// from cookies on every request. Without this, Next.js can cache the
// rendered output/data for this route and reuse it across different users
// or sessions hitting the same URL - which is what caused stale brand
// colours after a refresh, and briefly showed one signed-in user's
// dashboard to the next person who logs in on the same device. Unaffected
// by getAuthedProfile's use of React's cache() above - that only dedupes
// work WITHIN one request and never caches across requests.
export const dynamic    = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

export default async function TeacherLayout({
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
