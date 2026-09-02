// src/app/dashboard/examination/notifications/page.tsx
import { getExamContext } from '@/lib/supabase/getExamContext'
import NotificationsPageClient from './NotificationsPageClient'

export default async function ExaminationNotificationsPage() {
  const { supabase, profile, school, userId, schoolId } = await getExamContext()

  const { data: notifications } = await supabase
    .from('notifications')
    .select('id, title, body, type, is_read, created_at, action_url')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  const unreadCount = (notifications ?? []).filter((n: any) => !n.is_read).length

  return (
    <NotificationsPageClient
      initialNotifications={notifications ?? []}
      unreadCount={unreadCount}
      userId={userId}
      role="examination"
      schoolId={schoolId}
      profile={profile}
      school={school}
      schoolColor={school?.primary_color ?? '#7C3AED'}
    />
  )
}
