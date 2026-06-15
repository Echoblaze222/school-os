// BUG FIX: was querying school_branding (wrong table) — changed to profiles→schools join.

import { createClient } from '@/lib/supabase/server'
import SchoolBrandInjector from '@/components/SchoolBrandInjector'

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode
}) {

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let primaryColor = '#7C3AED'
  let fontFamily   = 'Inter'

  if (user) {
    const { data: profileWithSchool } = await supabase
      .from('profiles')
      .select('schools(primary_color, font_family)')
      .eq('id', user.id)
      .single()

    const school = (profileWithSchool as any)?.schools
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