// src/app/dashboard/hostel/notifications/page.tsx
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect }          from 'next/navigation'
import { requireHostelStaff } from '@/lib/permissions'
import NotificationsPageClient from './NotificationsPageClient'

export default async function HostelNotificationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const access = await requireHostelStaff(admin, user.id)
  if (!access) redirect('/dashboard')

  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', user.id).single()
  const school   = (profile as any)?.schools ?? null
  const schoolId = (profile as any)?.school_id ?? ''

  const { data: notifications } = await supabase
    .from('notifications')
    .select('id, title, body, type, is_read, created_at, action_url')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  const unreadCount = (notifications ?? []).filter((n: any) => !n.is_read).length

  return (
    <NotificationsPageClient
      initialNotifications={notifications ?? []}
      unreadCount={unreadCount}
      userId={user.id}
      role="hostel"
      schoolId={schoolId}
      profile={profile}
      school={school}
      schoolColor={school?.primary_color ?? '#800020'}
    />
  )
}
