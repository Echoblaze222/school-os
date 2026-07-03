// src/app/dashboard/principal/students/promote/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PromoteClient from './PromoteClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Promote Students — SchoolOS' }

export default async function PromotePage() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role, school_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'principal') redirect('/login')

  const { data: school } = await supabase
    .from('school_branding')
    .select('id, school_name, logo_url, primary_color')
    .eq('id', profile.school_id)
    .single()

  return (
    <PromoteClient
      userId={user.id}
      profile={profile}
      school={school}
      role={profile.role}
      schoolId={profile.school_id}
      schoolColor={school?.primary_color ?? '#7C3AED'}
    />
  )
}
