// src/app/dashboard/coach/notifications/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import { hasActiveAppointment } from '@/lib/permissions'
import NotificationsPageClient from './NotificationsPageClient'

export default async function CoachNotificationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, school_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'teacher') redirect('/login')
  const isCoach = await hasActiveAppointment(supabase, user.id, profile.school_id, 'coach')
  if (!isCoach) redirect('/dashboard/teacher')

  const { data: school } = await supabase
    .from('schools')
    .select('id, name, logo_url, primary_color')
    .eq('id', profile.school_id)
    .single()

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
      role="coach"
      schoolId={profile.school_id}
      profile={profile}
      school={school}
      schoolColor={school?.primary_color ?? '#00B4D8'}
    />
  )
}
