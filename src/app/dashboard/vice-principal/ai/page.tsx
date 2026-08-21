// src/app/dashboard/vice-principal/ai/page.tsx

import { requireAppointmentPage } from '@/lib/permissions'
import UniversalAIPage from '@/components/UniversalAIPage'

export default async function VpAiPage() {
  const { supabase, ctx } = await requireAppointmentPage('vice_principal')

  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', ctx.userId).single()
  const school = (profile as any)?.schools ?? null

  return <UniversalAIPage profile={profile} school={school} userId={ctx.userId} role="vice_principal" />
}
