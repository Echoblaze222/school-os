// src/app/dashboard/librarian/layout.tsx
// Mirrors counselor/layout.tsx and ict/layout.tsx: injects the school's
// brand colors + font as CSS variables on <html> before first paint,
// covering every librarian sub-page with zero client-component changes.

import { createClient } from '@/lib/supabase/server'
import SchoolBrandInjector from '@/components/SchoolBrandInjector'

export const dynamic    = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

export default async function LibrarianLayout({
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
