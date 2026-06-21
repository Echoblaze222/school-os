// src/app/dashboard/student/notifications/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// FIX 1: Was importing 'NotificationsClient' but the file is named
//         'NotificationsPageClient.tsx' — this caused a Next.js build error
//         (module not found) and a blank page at runtime.
//
// FIX 2: Was passing { profile, school, userId } but NotificationsPageClient
//         expects { initialNotifications, unreadCount, userId, role }.
//         The old prop shape matched NotificationsClient.tsx (the orphan file)
//         which has no push support. Now passes the correct props to the
//         correct component.
//
// FIX 3: Was using createServerClient manually — unified to use the shared
//         @/lib/supabase/server wrapper (consistent with all other roles).
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import NotificationsPageClient from './NotificationsPageClient'

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
    
