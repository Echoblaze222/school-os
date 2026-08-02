// src/app/dashboard/secretary/clinic/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ClinicClient from './ClinicClient'

export default async function ClinicPage() {
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

  const { data: visits } = await supabase
    .from('clinic_visits')
    .select('*, profiles!clinic_visits_student_id_fkey(full_name, default_code)')
    .eq('school_id', profile.school_id)
    .order('visited_at', { ascending: false })
    .limit(100)

  const { data: records } = await supabase
    .from('student_medical_records')
    .select('*, profiles!student_medical_records_student_id_fkey(full_name, default_code)')
    .eq('school_id', profile.school_id)

  const { data: students } = await supabase
    .from('profiles')
    .select('id, full_name, default_code')
    .eq('school_id', profile.school_id)
    .eq('role', 'student')
    .order('full_name', { ascending: true })

  return (
    <ClinicClient
      visits={visits ?? []}
      records={records ?? []}
      students={students ?? []}
      profile={profile}
      school={school}
      userId={user.id}
    />
  )
}
