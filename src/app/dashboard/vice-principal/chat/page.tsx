// src/app/dashboard/vice-principal/chat/page.tsx
// Same shape as every other role's chat page (see nurse/chat/page.tsx),
// gated via requireAppointmentPage the same way this role's other pages
// already are, rather than re-deriving the profile.role check that would
// be wrong for an appointment-based role.

import { requireAppointmentPage } from '@/lib/permissions'
import UniversalChatPage from '@/components/UniversalChatPage'

export default async function VpChatPage() {
  const { supabase, ctx } = await requireAppointmentPage('vice_principal')

  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', ctx.userId).single()
  const school = (profile as any)?.schools ?? null
  const schoolColor = school?.primary_color ?? '#800020'

  return (
    <UniversalChatPage
      profile={profile} school={school}
      userId={ctx.userId} role="vice-principal"
      schoolColor={schoolColor}
    />
  )
}
