// src/app/dashboard/secretary/codes/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CodesClient from './CodesClient'

export default async function CodesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'secretary') redirect('/login')
  const school = (profile as any)?.schools ?? null

  const { data: entries } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, default_code, is_active, created_at')
    .eq('school_id', profile.school_id)
    .eq('is_active', true)
    .order('role')
    .order('full_name')

  // Student roster for the "New Parent Code" form — lets the secretary link
  // a freshly-created parent account to the right child without typing an ID.
  const { data: studentRows } = await supabase
    .from('profiles')
    .select('id, full_name, class_level, admission_number')
    .eq('school_id', profile.school_id)
    .eq('role', 'student')
    .eq('is_active', true)
    .order('full_name')

  // Classes for the "New Student Code" / bulk student rows — lets the
  // secretary assign a class right at enrolment time.
  const { data: classRows } = await supabase
    .from('classes')
    .select('id, name, class_level, section')
    .eq('school_id', profile.school_id)
    .order('class_level')
    .order('section')

  return (
    <CodesClient
      entries={entries ?? []}
      students={studentRows ?? []}
      classes={classRows ?? []}
      profile={profile}
      school={school}
      userId={user.id}
      schoolId={profile.school_id}
    />
  )
}
