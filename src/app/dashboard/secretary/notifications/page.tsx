// src/app/dashboard/secretary/notifications/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// FIX 1: Was importing NotificationsPageClient from the BURSAR's folder:
//         '@/app/dashboard/bursar/notifications/NotificationsPageClient'
//         This is wrong — it must import from its own folder './NotificationsPageClient'.
//         As a side effect the role prop was hardcoded to "secretary" which
//         would be correct, but the nav links inside the component would still
//         point to the right paths because ROLE_DASHBOARDS maps 'secretary'
//         correctly. The root problem was the cross-role import.
//
// FIX 2: Was using a raw createServerClient() call instead of the shared
//         @/lib/supabase/server wrapper — inconsistent and harder to maintain.
//
// FIX 3: Missing role guard check — was checking profile.role !== 'secretary'
//         but the secretary NotificationsPageClient has no role restriction
//         itself; the guard should live only in the page. Kept guard but
//         cleaned up to use the shared supabase client.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import NotificationsPageClient from './NotificationsPageClient'

export default async function SecretaryNotificationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, school_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'secretary') redirect('/login')

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
      role={profile.role}
    />
  )
    }
