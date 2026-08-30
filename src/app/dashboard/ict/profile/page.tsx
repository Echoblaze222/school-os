// src/app/dashboard/ict/profile/page.tsx
import { createClient }      from '@/lib/supabase/server'
import { redirect }          from 'next/navigation'
import { getIctAppointment } from '@/lib/permissions'
import ProfileClient from './ProfileClient'

export default async function IctProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', user.id).single()
  if (!profile) redirect('/login')

  const appointment = await getIctAppointment(supabase, user.id, (profile as any).school_id)
  if (!appointment) redirect('/dashboard')

  const school = (profile as any)?.schools ?? null

  return <ProfileClient profile={profile} school={school} userId={user.id} />
}
