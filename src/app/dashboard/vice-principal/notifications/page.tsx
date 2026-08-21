// src/app/dashboard/vice-principal/notifications/page.tsx

import { requireAppointmentPage } from '@/lib/permissions'
import NotificationsClient from './NotificationsClient'

export default async function VpNotificationsPage() {
  const { supabase, ctx } = await requireAppointmentPage('vice_principal')

  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', ctx.userId).single()
  const school = (profile as any)?.schools ?? null

  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <NotificationsClient
      profile={profile} school={school} userId={ctx.userId}
      initialNotifications={notifications ?? []}
    />
  )
}
