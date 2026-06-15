// src/app/dashboard/secretary/admissions/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdmissionsClient from './AdmissionsClient'

export default async function AdmissionsPage() {
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

  const [{ data: admissions }, { data: classes }] = await Promise.all([
    supabase.from('admissions').select('*').eq('school_id', profile.school_id).order('applied_at', { ascending: false }),
    supabase.from('classes').select('id, name').eq('school_id', profile.school_id).order('name'),
  ])

  return <AdmissionsClient admissions={admissions ?? []} profile={profile} school={school} userId={user.id} classes={classes ?? []} />
}
