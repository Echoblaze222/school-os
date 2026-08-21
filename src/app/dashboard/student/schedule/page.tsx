import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ScheduleClient from './ScheduleClient'
export default async function SchedulePage() {
  const supabase =await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*, schools(*)').eq('id', user.id).single()
  const school = (profile as any)?.schools ?? null

  // student_profiles.class_id is what promotion/transfer actually updates - // it's the CURRENT class. profiles.class_id is never touched by
  // promotion, so it goes stale after any promotion; only used as a
  // fallback when a student has no student_profiles row at all.
  const { data: sp } = await supabase
    .from('student_profiles')
    .select('class_id')
    .eq('id', user.id)
    .maybeSingle()

  const patchedProfile = { ...(profile as any), class_id: sp?.class_id ?? (profile as any)?.class_id ?? null }

  return <ScheduleClient profile={patchedProfile} school={school} userId={user.id} />
}