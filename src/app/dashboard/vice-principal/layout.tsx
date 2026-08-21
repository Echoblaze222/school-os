// src/app/dashboard/vice-principal/layout.tsx
// Injects the school's brand colours + font as CSS variables on <html>
// before first paint - same pattern as every other role layout (see
// dashboard/principal/layout.tsx). Auth and appointment verification
// happen per-page via requireAppointmentPage('vice_principal'), not here -
// see docs/phase1-foundation/06-SECURITY-NOTES.md on why a layout-only
// check is not sufficient on its own.

import { createClient } from '@/lib/supabase/server'
import SchoolBrandInjector from '@/components/SchoolBrandInjector'

export const dynamic    = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

export default async function VicePrincipalLayout({
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
      .select('schools(primary_color, secondary_color, font_family)')
      .eq('id', user.id)
      .single()

    const school = (profile as any)?.schools
    if (school?.primary_color)   primaryColor   = school.primary_color
    if (school?.secondary_color) secondaryColor = school.secondary_color
    if (school?.font_family)     fontFamily     = school.font_family
  }

  return (
    <>
      <SchoolBrandInjector primaryColor={primaryColor} secondaryColor={secondaryColor} fontFamily={fontFamily} />
      {children}
    </>
  )
}
