import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NotificationsPageClient from './NotificationsPageClient'

// Place this file at each role's notifications folder:
// src/app/dashboard/student/notifications/page.tsx
// src/app/dashboard/teacher/notifications/page.tsx
// src/app/dashboard/principal/notifications/page.tsx
// etc.

export default async function NotificationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, school_id')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  // Load first 50 notifications
  const { data: notifications } = await supabase
    .from('notifications')
    .select('id, title, body, type, is_read, created_at, link_url')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  const unreadCount = notifications?.filter(n => !n.is_read).length ?? 0

  return (
    <NotificationsPageClient
      initialNotifications={notifications ?? []}
      unreadCount={unreadCount}
      userId={user.id}
      role={profile.role}
    />
  )
}
