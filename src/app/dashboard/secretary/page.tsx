// src/app/dashboard/secretary/page.tsx

import { createClient }      from '@/lib/supabase/server'
import { redirect }          from 'next/navigation'
import { checkSubscription } from '@/lib/subscription'
import SubscriptionGate      from '@/components/SubscriptionGate'
import SecretaryClient       from './SecretaryClient'

export default async function SecretaryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

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

  // ── Profile + school (single query, join inline like principal/page.tsx) ──
  // FIX: join schools(*) inline — separate schools query returned null due to RLS
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'secretary') redirect('/login')

  const school   = (profile as any).schools ?? null
  const schoolId = profile.school_id

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [students, transfers, weekly, activeUsers] = await Promise.all([
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
  ])

  const counts = {
    totalStudents: students.count    ?? 0,
    pendingApps:   transfers.count   ?? 0,
    newThisWeek:   weekly.count      ?? 0,
    activeUsers:   activeUsers.count ?? 0,
  }

  // ── Recent activities (last 15, most recent first) ─────────────────────────
  const { data: activityRows } = await supabase
    .from('recent_activities')
    .select('id, type, title, subtitle, href, metadata, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(15)

  const activities = (activityRows ?? []).map(row => ({
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
    />
  )
}
