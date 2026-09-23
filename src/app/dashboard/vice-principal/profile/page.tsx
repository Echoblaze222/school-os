// src/app/dashboard/vice-principal/profile/page.tsx

import { requireAppointmentPage } from '@/lib/permissions'
import ProfileClient from './ProfileClient'
import { SELF_PROFILE_SAFE_COLUMNS } from '@/lib/supabase/profileSelectors'

export default async function VpProfilePage() {
  const { supabase, ctx } = await requireAppointmentPage('vice_principal')

  // employee_id added on top of the shared safe list: this page's
  // ProfileClient displays it (read-only "Employee ID" field). Already
  // confirmed SAFE_CLIENT for self-view during the teacher/profile batch.
  const { data: profile } = await supabase
    .from('profiles').select(`${SELF_PROFILE_SAFE_COLUMNS}, employee_id, schools(*)`).eq('id', ctx.userId).single()
  const school = (profile as any)?.schools ?? null

  return <ProfileClient profile={profile} school={school} userId={ctx.userId} />
}
