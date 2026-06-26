// src/app/dashboard/secretary/records/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import RecordsClient from './RecordsClient'

export default async function RecordsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // FIX: use profiles → schools(*) — same pattern as every other dashboard page
  // school_branding.id !== school_id so querying school_branding by profile.school_id was wrong
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'secretary') redirect('/login')

  const school = (profile as any).schools ?? null

  // All students in the school for the dropdown
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, full_name, role, default_code')
    .eq('school_id', profile.school_id)
    .order('full_name')

  const students = (allProfiles ?? []).filter((p: any) => p.role === 'student')

  // Existing behaviour records for this school
  const { data: records } = await supabase
    .from('behaviour_records')
    .select('*')
    .eq('school_id', profile.school_id)
    .order('created_at', { ascending: false })

  return (
    <RecordsClient
      records={records ?? []}
      profile={profile}
      school={school}
      userId={user.id}
      students={students}
      allProfiles={allProfiles ?? []}
    />
  )
}
