// src/app/dashboard/secretary/layout.tsx
// Injects the school's brand colour + font as CSS variables before first paint.

import { createClient } from '@/lib/supabase/server'
import SchoolBrandInjector from '@/components/SchoolBrandInjector'

export default async function SecretaryLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let primaryColor = '#7C3AED'
  let fontFamily   = 'Inter'

  if (user) {
    // profiles.school_id references schools.id — use schools(*) join, not school_branding
    const { data: profile } = await supabase
      .from('profiles')
      .select('school_id, schools(primary_color, font_family)')
      .eq('id', user.id)
      .single()

    const school = (profile as any)?.schools ?? null
    if (school?.primary_color) primaryColor = school.primary_color
    if (school?.font_family)   fontFamily   = school.font_family
  }

  return (
    <>
      <SchoolBrandInjector primaryColor={primaryColor} fontFamily={fontFamily} />
      {children}
    </>
  )
  }
      
