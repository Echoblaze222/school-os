// src/app/dashboard/teacher/profile/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProfileClient from './ProfileClient'
import { SELF_PROFILE_SAFE_COLUMNS } from '@/lib/supabase/profileSelectors'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // qualification/employee_id/years_experience added on top of the shared
  // safe list: this page's ProfileClient displays and edits all three
  // (its own "FIX #12" comment documents why). All three are SAFE_CLIENT
  // for self-view (institutional/operational identifiers, not credential
  // or government-ID material - see the C2 field classification table),
  // but they're specific to the teacher profile page, not the generic
  // "my profile for page layout" pattern, so they're added explicitly at
  // this call site per C2 rule 2 rather than expanding the shared
  // constant.
  const { data: profile } = await supabase
    .from('profiles')
    .select(`${SELF_PROFILE_SAFE_COLUMNS}, qualification, employee_id, years_experience, schools(*)`)
    .eq('id', user.id)
    .single()
  const school = (profile as any)?.schools ?? null
  return <ProfileClient profile={profile} school={school} userId={user.id} />
}
