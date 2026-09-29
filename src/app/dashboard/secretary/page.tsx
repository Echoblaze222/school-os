// src/app/dashboard/secretary/page.tsx

import { createClient }      from '@/lib/supabase/server'
import { redirect }          from 'next/navigation'
import { checkSubscription } from '@/lib/subscription'
import SubscriptionGate      from '@/components/SubscriptionGate'
import SecretaryClient       from './SecretaryClient'
import { getAuthedProfile }  from '@/lib/auth/getAuthedProfile'

export default async function SecretaryPage() {
  // Shared with secretary/layout.tsx via React's cache() - see
  // src/lib/auth/getAuthedProfile.ts.
  const { user, profile, school } = await getAuthedProfile()
  if (!user) redirect('/login')
  if (!profile || profile.role !== 'secretary') redirect('/login')

  // ── Subscription check (before any other data fetching) ──────────────────
  const sub = await checkSubscription(user.id)
  if (sub.locked) {
    return (
      <SubscriptionGate
        schoolName={sub.schoolName}
        schoolColor={sub.schoolColor}
        status={sub.status as any}
      />
    )
  }

  const supabase = await createClient()
  const schoolId = profile.school_id

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // recent_activities folded into this batch - was a separate, sequential
  // await after this block finished, adding one more full round trip for
  // no reason (nothing else here depends on it or feeds into it).
  const [students, transfers, weekly, activeUsers, pendingAdmissions, notifRows, unreadNotifCount, activityRowsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('role', 'student'),
    supabase
      .from('student_transfers')
      .select('id', { count: 'exact', head: true })
      .eq('origin_school_id', schoolId)
      .eq('status', 'requested'),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('role', 'student')
      .gte('created_at', weekAgo),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('is_active', true),
    // Repointed from legacy public.admissions to the canonical
    // admission_applications table (Phase 4, Lane D). 'submitted' +
    // 'under_review' are this table's equivalent of the old 'pending'.
    supabase
      .from('admission_applications')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .in('status', ['submitted', 'under_review']),
    supabase
      .from('notifications')
      .select('id, title, body, type, created_at, action_url, link_url')
      .eq('user_id', user.id).eq('is_read', false)
      .order('created_at', { ascending: false }).limit(3),
    supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('is_read', false),
    supabase
      .from('recent_activities')
      .select('id, type, title, subtitle, href, metadata, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(15),
  ])

  const counts = {
    totalStudents:     students.count          ?? 0,
    pendingApps:        transfers.count         ?? 0,
    newThisWeek:        weekly.count            ?? 0,
    activeUsers:        activeUsers.count       ?? 0,
    pendingAdmissions:  pendingAdmissions.count ?? 0,
  }

  const pendingNotifications = (notifRows.data ?? []).map((n: any) => ({
    id:         n.id,
    title:      n.title,
    body:       n.body,
    type:       n.type,
    created_at: n.created_at,
    href:       n.action_url ?? n.link_url ?? '/dashboard/secretary/notifications',
  }))

  const activities = (activityRowsRes.data ?? []).map(row => ({
    id:         row.id,
    type:       row.type,
    title:      row.title,
    subtitle:   row.subtitle ?? undefined,
    href:       row.href,
    created_at: row.created_at,
    preview: row.metadata
      ? {
          body: row.metadata.body,
          meta: row.metadata.meta,
        }
      : undefined,
  }))

  return (
    <SecretaryClient
      profile={profile}
      school={school}
      userId={user.id}
      counts={counts}
      activities={activities}
      pendingNotifications={pendingNotifications}
      unreadNotifCount={unreadNotifCount.count ?? 0}
    />
  )
}
