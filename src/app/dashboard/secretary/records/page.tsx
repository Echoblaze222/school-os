// src/app/dashboard/secretary/records/page.tsx
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import RecordsClient from './RecordsClient'

export default async function RecordsPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll() { return cookieStore.getAll() }, setAll(c: any[]) { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } } })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'secretary') redirect('/login')
  const { data: school } = await supabase.from('school_branding').select('*').eq('id', profile.school_id).single()

  // All profiles in the school — used to resolve student_id / recorded_by to names
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, full_name, role, admission_number, class_id')
    .eq('school_id', profile.school_id)
    .order('full_name')

  const students = (allProfiles ?? []).filter(p => p.role === 'student')

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
