// src/app/dashboard/ict/layout.tsx
//
// SECURITY: 'ict' is not one of the 6 base profiles.role values, so
// middleware.ts's DASHBOARD_ROLE_SEGMENTS boundary check (which only
// fires for segments it recognizes) does NOT cover /dashboard/ict/*:
// today, any authenticated user who types this URL passes middleware
// untouched. This layout is therefore the real, and currently only,
// authorization boundary for the entire ICT dashboard tree. Every API
// route under /api/ict/* also re-checks independently (never trust a
// hidden nav item or a layout redirect as the actual security boundary
//, this layout is a UX convenience on top of routes that are already
// safe without it), but this file is what stops an unauthorized user
// from ever seeing the ICT UI shell in the first place.
//
// Flag for whoever owns middleware.ts / the Lane F context switcher:
// the same gap exists for every other new Phase 2 lane
// (vice-principal, counselor, examination, hostel) since none of their
// segments are in DASHBOARD_ROLE_SEGMENTS either. Worth a single shared
// fix (an appointment-aware check alongside the existing role check)
// rather than five lanes independently re-deriving this same layout
// guard.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getIctAppointment } from '@/lib/permissions'
import SchoolBrandInjector from '@/components/SchoolBrandInjector'

export const dynamic    = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

export default async function IctLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('school_id, schools(primary_color, secondary_color, font_family)')
    .eq('id', user.id)
    .single()

  if (!profile?.school_id) redirect('/login')

  const admin = createAdminClient()
  const appointment = await getIctAppointment(admin, user.id, profile.school_id)
  if (!appointment) redirect('/dashboard')

  const school = (profile as any).schools
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
