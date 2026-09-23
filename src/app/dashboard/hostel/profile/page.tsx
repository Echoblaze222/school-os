// src/app/dashboard/hostel/profile/page.tsx
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect }          from 'next/navigation'
import { requireHostelStaff } from '@/lib/permissions'
import ProfileClient from './ProfileClient'
import { SELF_PROFILE_SAFE_COLUMNS } from '@/lib/supabase/profileSelectors'

export default async function HostelProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const access = await requireHostelStaff(admin, user.id)
  if (!access) redirect('/dashboard')

  const { data: profile } = await supabase
    .from('profiles').select(`${SELF_PROFILE_SAFE_COLUMNS}, schools(*)`).eq('id', user.id).single()
  const school = (profile as any)?.schools ?? null

  return <ProfileClient profile={profile} school={school} userId={user.id} />
}
