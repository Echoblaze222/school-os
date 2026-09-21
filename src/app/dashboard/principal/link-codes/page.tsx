// src/app/dashboard/principal/link-codes/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LinkCodesPage from '@/components/LinkCodesPage'

export const metadata = { title: 'Parent link codes | SchoolOS' }

export default async function PrincipalLinkCodesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Only the columns this page needs are sent to the browser.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, school_id, full_name, avatar_url, schools(id, name, logo_url, primary_color)')
    .eq('id', user.id)
    .single()

  if (!profile || (profile as any).role !== 'principal') redirect('/login')
  const schoolId = (profile as any).school_id as string
  const school = (profile as any).schools ?? null

  const { data: students } = await supabase
    .from('profiles')
    .select('id, full_name, class_level')
    .eq('school_id', schoolId)
    .eq('role', 'student')
    .eq('is_active', true)
    .order('full_name')

  return (
    <LinkCodesPage
      role="principal"
      userId={user.id}
      profile={profile}
      school={school}
      students={(students ?? []) as any}
    />
  )
}
