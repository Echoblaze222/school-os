import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { hasActiveAppointment } from '@/lib/permissions'
import ProfileClient from './ProfileClient'
import { SELF_PROFILE_SAFE_COLUMNS } from '@/lib/supabase/profileSelectors'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select(`${SELF_PROFILE_SAFE_COLUMNS}, schools(*)`).eq('id', user.id).single()
  if (!profile || profile.role !== 'teacher') redirect('/login')

  const isLibrarian = await hasActiveAppointment(supabase, user.id, profile.school_id, 'librarian')
  if (!isLibrarian) redirect('/dashboard/teacher')

  const school = (profile as any)?.schools ?? null
  return <ProfileClient profile={profile} school={school} userId={user.id} />
}
