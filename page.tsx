// src/app/dashboard/ict/chat/page.tsx
// Fixes a dead link: this route was already wired into RoleNav's ICT
// config but no page.tsx existed here. Gated via getIctAppointment, same
// as the rest of the ICT dashboard tree (see dashboard/ict/page.tsx and
// dashboard/ict/layout.tsx's own comment on why the layout is the real
// boundary here, this check is defense in depth, not the only gate).

import { createClient }      from '@/lib/supabase/server'
import { redirect }          from 'next/navigation'
import { getIctAppointment } from '@/lib/permissions'
import UniversalChatPage from '@/components/UniversalChatPage'

export default async function IctChatPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', user.id).single()
  if (!profile) redirect('/login')

  const appointment = await getIctAppointment(supabase, user.id, (profile as any).school_id)
  if (!appointment) redirect('/dashboard')

  const school = (profile as any)?.schools ?? null
  const schoolColor = school?.primary_color ?? '#00B4D8'

  return (
    <UniversalChatPage
      profile={profile} school={school}
      userId={user.id} role="ict"
      schoolColor={schoolColor}
    />
  )
}
