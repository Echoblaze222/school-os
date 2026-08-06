// src/app/dashboard/teacher/layout.tsx
// Injects the school's brand colours + font as CSS variables on <html>
// before first paint — covers every sub-page with zero client-component changes.
//
// primary_color, secondary_color, and font_family all live directly on the
// `schools` table (added via the schools-branding-columns migration — see
// src/lib/supabase/types.ts).

import { createClient } from '@/lib/supabase/server'
import SchoolBrandInjector from '@/components/SchoolBrandInjector'

export default async function TeacherLayout({
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
