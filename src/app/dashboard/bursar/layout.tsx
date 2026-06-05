// src/app/dashboard/bursar/layout.tsx
// Injects the school's brand colour + font as CSS variables before first paint.

import { createClient } from '@/lib/supabase/server'
import SchoolBrandInjector from '@/components/SchoolBrandInjector'

export default async function BursarLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let primaryColor = '#7C3AED'
  let fontFamily   = 'Inter'

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('school_id')
      .eq('id', user.id)
      .single()

    if (profile?.school_id) {
      const { data: school } = await supabase
        .from('schools')
        .select('primary_color, font_family')
        .eq('id', profile.school_id)
        .single()

      if (school?.primary_color) primaryColor = school.primary_color
      if (school?.font_family)   fontFamily   = school.font_family
    }
  }

  return (
    <>
      <SchoolBrandInjector primaryColor={primaryColor} fontFamily={fontFamily} />
      {children}
    </>
  )
}
