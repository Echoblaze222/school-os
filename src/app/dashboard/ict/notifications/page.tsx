// src/app/dashboard/ict/notifications/page.tsx
import { createClient }      from '@/lib/supabase/server'
import { redirect }          from 'next/navigation'
import { getIctAppointment } from '@/lib/permissions'
import NotificationsPageClient from './NotificationsPageClient'

export default async function IctNotificationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', user.id).single()
  if (!profile) redirect('/login')

  const appointment = await getIctAppointment(supabase, user.id, (profile as any).school_id)
  if (!appointment) redirect('/dashboard')

  const school   = (profile as any)?.schools ?? null
  const schoolId = (profile as any)?.school_id ?? ''

  const { data: notifications } = await supabase
    .from('notifications')
    .select('id, title, body, type, is_read, created_at, link_url')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  const unreadCount = (notifications ?? []).filter((n: any) => !n.is_read).length

  return (
    <NotificationsPageClient
      initialNotifications={notifications ?? []}
      unreadCount={unreadCount}
      userId={user.id}
      role="ict"
      schoolId={schoolId}
      profile={profile}
      school={school}
      schoolColor={school?.primary_color ?? '#00B4D8'}
    />
  )
}
