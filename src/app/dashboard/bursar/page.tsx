// src/app/dashboard/bursar/page.tsx

import { createClient }       from '@/lib/supabase/server'
import { redirect }           from 'next/navigation'
import { checkSubscription }  from '@/lib/subscription'
import SubscriptionGate       from '@/components/SubscriptionGate'
import BursarDashboardClient  from './BursarDashboardClient'

export default async function BursarDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // ── Subscription check ────────────────────────────────────────────────────
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

  // ── Profile + school ──────────────────────────────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'bursar') redirect('/login')

  const school   = (profile as any)?.schools ?? null
  const schoolId = profile.school_id

  // ── Counts for stats cards ────────────────────────────────────────────────
  const [
    { count: pendingPayments },
    { count: totalStudents },
    { count: paidThisMonth },
    { count: overdueCount },
  ] = await Promise.all([
    supabase
      .from('fee_payments')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('status', 'pending'),

    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('role', 'student'),

    supabase
      .from('fee_payments')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('status', 'paid')
      .gte('paid_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),

    supabase
      .from('fee_payments')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('status', 'overdue'),
  ])

  const counts = {
    pendingPayments: pendingPayments ?? 0,
    totalStudents:   totalStudents   ?? 0,
    paidThisMonth:   paidThisMonth   ?? 0,
    overdueCount:    overdueCount    ?? 0,
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
    <BursarDashboardClient
      profile={profile}
      school={school}
      userId={user.id}
      counts={counts}
      activities={activities}
    />
  )
}
