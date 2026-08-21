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
  // NOTE: fee_payments has no `status`/`paid_at` columns - the source of truth
  // for what's owed/paid per student is `school_fees` (amount_ngn, paid_ngn, status).
  // fee_payments is just an append-only log of recorded transactions.
  const [
    { data: feeRows },
    { count: totalStudents },
    { count: paidThisMonth },
  ] = await Promise.all([
    supabase
      .from('school_fees')
      .select('amount_ngn, paid_ngn, status, due_date, term, student_id')
      .eq('school_id', schoolId),

    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('role', 'student'),

    supabase
      .from('fee_payments')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
  ])

  const rows = feeRows ?? []
  const totalDue       = rows.reduce((sum, r: any) => sum + (Number(r.amount_ngn) || 0), 0)
  const totalCollected = rows.reduce((sum, r: any) => sum + (Number(r.paid_ngn)   || 0), 0)
  const outstanding    = Math.max(0, totalDue - totalCollected)
  const paidCount      = rows.filter((r: any) => r.status === 'paid').length
  const pendingCount   = rows.filter((r: any) => r.status === 'pending' || r.status === 'partial').length
  const overdueCount   = rows.filter((r: any) =>
    (r.status === 'pending' || r.status === 'partial') && r.due_date && new Date(r.due_date) < new Date()
  ).length
  const collectionRate = totalDue > 0 ? Math.round((totalCollected / totalDue) * 100) : 0

  // Most common term value among current fee rows, as a display label
  const termCounts: Record<string, number> = {}
  for (const r of rows) { if (r.term) termCounts[r.term] = (termCounts[r.term] ?? 0) + 1 }
  const currentTerm = Object.entries(termCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'This Term'

  // Top 3 debtors (highest outstanding balance), for the home-screen preview.
  // No FK relationship is declared on school_fees.student_id in the schema,
  // so we compute the top balances here and resolve names in a second query.
  const debtorTotals = new Map<string, { studentId: string; outstanding: number; term: string | null }>()
  for (const r of rows as any[]) {
    if (!r.student_id) continue
    const bal = (Number(r.amount_ngn) || 0) - (Number(r.paid_ngn) || 0)
    if (bal <= 0) continue
    const existing = debtorTotals.get(r.student_id)
    if (existing) existing.outstanding += bal
    else debtorTotals.set(r.student_id, { studentId: r.student_id, outstanding: bal, term: r.term ?? null })
  }
  const topDebtorIds = [...debtorTotals.values()]
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, 3)

  const { data: debtorProfileRows } = topDebtorIds.length
    ? await supabase.from('profiles')
        .select('id, full_name')
        .in('id', topDebtorIds.map(d => d.studentId))
    : { data: [] as any[] }

  const nameById = new Map((debtorProfileRows ?? []).map((p: any) => [p.id, p.full_name]))
  const topDebtors = topDebtorIds.map(d => ({
    id: d.studentId,
    name: nameById.get(d.studentId) ?? 'Student',
    outstanding: d.outstanding,
    term: d.term,
  }))

  const counts = {
    totalCollected,
    outstanding,
    paidCount,
    pendingCount,
    overdueCount,
    collectionRate,
    currentTerm,
    totalStudents:   totalStudents   ?? 0,
    paidThisMonth:   paidThisMonth   ?? 0,
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
      topDebtors={topDebtors}
    />
  )
}
