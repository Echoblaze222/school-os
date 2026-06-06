// src/app/dashboard/principal/codes/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CodesClient from './CodesClient'

export const metadata = { title: 'Access Codes — SchoolOS' }

export default async function PrincipalCodesPage() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  if (!profile || (profile as any).role !== 'principal') redirect('/login')

  const school   = (profile as any).schools ?? null
  const schoolId = (profile as any).school_id ?? ''

  const { data: entries } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, default_code, is_active, created_at')
    .eq('school_id', schoolId)
    .order('role')
    .order('full_name')

  // Fetch classes for student enrolment
  const { data: classes } = await supabase
    .from('classes')
    .select('id, name, class_level, section')
    .eq('school_id', schoolId)
    .order('class_level')
    .order('section')

  return (
    <CodesClient
      entries={entries ?? []}
      classes={classes ?? []}
      profile={profile}
      school={school}
      userId={user.id}
      schoolId={schoolId}
    />
  )
}
