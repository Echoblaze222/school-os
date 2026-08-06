// src/app/dashboard/principal/layout.tsx
// Injects the school's brand colours + font as CSS variables on <html>
// before first paint — covers every sub-page with zero client-component changes.
//
// primary_color + font_family read from `schools` (reliable — always exists
// per school; other roles' layouts learned this the hard way, see teacher/layout.tsx).
// secondary_color is only stored on school_branding, so it's fetched
// separately and best-effort — a school that hasn't saved branding yet
// simply falls back to the default gold in SchoolBrandInjector.

import { createClient } from '@/lib/supabase/server'
import SchoolBrandInjector from '@/components/SchoolBrandInjector'

export default async function PrincipalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  let primaryColor   = '#7C3AED'
  let secondaryColor: string | undefined
  let fontFamily      = 'Inter'

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('school_id, schools(primary_color, font_family)')
      .eq('id', user.id)
      .single()

    const school = (profile as any)?.schools
    if (school?.primary_color) primaryColor = school.primary_color
    if (school?.font_family)   fontFamily   = school.font_family

    if (profile?.school_id) {
      const { data: branding } = await supabase
        .from('school_branding')
        .select('secondary_color')
        .eq('id', profile.school_id)
        .single()
      if (branding?.secondary_color) secondaryColor = branding.secondary_color
    }
  }

  return (
    <>
      <SchoolBrandInjector primaryColor={primaryColor} secondaryColor={secondaryColor} fontFamily={fontFamily} />
      {children}
    </>
  )
}
