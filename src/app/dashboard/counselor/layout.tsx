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

import { createClient } from '@/lib/supabase/server'
import SchoolBrandInjector from '@/components/SchoolBrandInjector'

export const dynamic    = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

export default async function CounselorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let primaryColor   = '#00B4D8'
  let secondaryColor: string | undefined = '#800020'
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
