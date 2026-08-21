// src/app/dashboard/vice-principal/profile/page.tsx

import { requireAppointmentPage } from '@/lib/permissions'
import ProfileClient from './ProfileClient'

export default async function VpProfilePage() {
  const { supabase, ctx } = await requireAppointmentPage('vice_principal')

  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', ctx.userId).single()
  const school = (profile as any)?.schools ?? null

  return <ProfileClient profile={profile} school={school} userId={ctx.userId} />
}
