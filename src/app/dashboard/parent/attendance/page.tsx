import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AttendanceClient from './AttendanceClient'
export default async function AttendancePage() {
  const supabase =await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*, schools(*)').eq('id', user.id).single()
  const school = (profile as any)?.schools ?? null
  return <AttendanceClient profile={profile} school={school} userId={user.id} />
}
