// src/app/dashboard/principal/page.tsx
// BUG 7 FIX: Was passing no counts - all zeros on dashboard. Now fetches real data.
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PrincipalDashboardClient from './PrincipalDashboardClient'

export default async function PrincipalDashboardPage() {
  const supabase = await createClient()

  // BUG 7 FIX: use getUser() not deprecated getSession()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', user.id).single()

  if (!profile || profile.role !== 'principal') redirect('/login')

  const school   = (profile as any)?.schools ?? null
  const schoolId = school?.id

  // BUG 7 FIX: fetch all counts in parallel
  const [
    { count: studentCount },
    { count: teacherCount },
    { count: classCount },
    { data: results },
    { data: feeRows },
    { data: notifRows },
    { count: unreadNotifCount },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true })
      .eq('school_id', schoolId).eq('role', 'student'),
    supabase.from('profiles').select('*', { count: 'exact', head: true })
      .eq('school_id', schoolId).eq('role', 'teacher'),
    supabase.from('classes').select('*', { count: 'exact', head: true })
      .eq('school_id', schoolId),
    supabase.from('results').select('score')
      .eq('school_id', schoolId).limit(200),
    supabase.from('school_fees').select('amount_ngn, paid_ngn')
      .eq('school_id', schoolId),
    supabase.from('notifications').select('id, title, body, type, created_at, action_url, link_url')
      .eq('user_id', user.id).eq('is_read', false)
      .order('created_at', { ascending: false }).limit(3),
    supabase.from('notifications').select('*', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('is_read', false),
  ])

  const scores   = (results ?? []).map((r: any) => r.score).filter((s: any) => s != null)
  const avgScore = scores.length
    ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length)
    : 0

  // Fee collection rate: sum(paid_ngn) / sum(amount_ngn) across the school
  const feeTotals = (feeRows ?? []).reduce(
    (acc: { due: number; paid: number }, r: any) => {
      acc.due  += Number(r.amount_ngn) || 0
      acc.paid += Number(r.paid_ngn)   || 0
      return acc
    },
    { due: 0, paid: 0 }
  )
  const feeCollectionRate = feeTotals.due > 0
    ? Math.round((feeTotals.paid / feeTotals.due) * 100)
    : 0

  // Currency formatting, not just the rate - prompt §6 wants the actual
  // amounts ("Fees Collected ₦24.8M", "Outstanding Fees ₦4.2M"), and both
  // numbers already exist in feeTotals above, no extra query needed.
  const nairaCompact = (n: number) => new Intl.NumberFormat('en-NG', {
    style: 'currency', currency: 'NGN', notation: 'compact', maximumFractionDigits: 1,
  }).format(n)
  const feesCollectedDisplay = nairaCompact(feeTotals.paid)
  const outstandingFeesDisplay = nairaCompact(Math.max(0, feeTotals.due - feeTotals.paid))

  const pendingNotifications = (notifRows ?? []).map((n: any) => ({
    id:         n.id,
    title:      n.title,
    body:       n.body,
    type:       n.type,
    created_at: n.created_at,
    href:       n.action_url ?? n.link_url ?? '/dashboard/principal/notifications',
  }))

  // Health score: weighted from presence of students/teachers/classes + avg score
  const hasAll      = studentCount && teacherCount && classCount
  const healthScore = hasAll ? Math.min(100, 60 + Math.round((avgScore / 100) * 40)) : 30

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
    <PrincipalDashboardClient
      profile={profile}
      school={school}
      userId={user.id}
      counts={{
        studentCount:   studentCount  ?? 0,
        teacherCount:   teacherCount  ?? 0,
        classCount:     classCount    ?? 0,
        avgScore,
        healthScore,
        feeCollectionRate,
        feesCollectedDisplay,
        outstandingFeesDisplay,
        pendingActions: (unreadNotifCount ?? 0),
      }}
      activities={activities}
      pendingNotifications={pendingNotifications}
      unreadNotifCount={unreadNotifCount ?? 0}
    />
  )
}
