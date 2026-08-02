import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ClinicClient from './ClinicClient'
export default async function TeacherClinicPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*, schools(*)').eq('id', user.id).single()
  if (!profile || profile.role !== 'teacher') redirect('/login')
  const school = (profile as any)?.schools ?? null
  return <ClinicClient profile={profile} school={school} userId={user.id} />
}
