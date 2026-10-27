// src/app/dashboard/principal/page.tsx
// BUG 7 FIX: Was passing no counts - all zeros on dashboard. Now fetches real data.
//
// FEES FIX: the fee numbers on this page used to come from `school_fees`, which
// is the dead table (the principal fees page, bursar, parent fees and the
// Paystack webhook all use `payment_invoices` + `payments`). Because that table
// is empty, "Fees Collected" always showed 0 and the collection rate 0%. It now
// reads the same live tables, scoped to the same term/year the principal fees
// page defaults to, so the home numbers match what the principal sees when
// they tap through to Fees.
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PrincipalDashboardClient from './PrincipalDashboardClient'

// Keep in sync with src/app/dashboard/principal/fees/page.tsx (same calendar
// guess, so the home and the Fees page always agree on the default term).
function getCurrentTermKey(): string {
  const m = new Date().getMonth()
  if (m >= 8) return 'first'
  if (m <= 2) return 'second'
  return 'third'
}
function getCurrentAcademicYear(): string {
  const m = new Date().getMonth()
  const y = new Date().getFullYear()
  return m >= 8 ? `${y}/${y + 1}` : `${y - 1}/${y}`
}
const TERM_LABELS: Record<string, string> = {
  first: 'First term',
  second: 'Second term',
  third: 'Third term',
}

// PostgREST caps a single response at 1000 rows by default, which would
// silently truncate sums for a large school. Page through the results instead
// (hard cap of 10 pages = 10,000 rows so a bad query can never loop forever).
async function fetchAllRows(
  build: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>,
  pageSize = 1000,
  maxPages = 10,
): Promise<any[]> {
  const rows: any[] = []
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize
    const { data, error } = await build(from, from + pageSize - 1)
    if (error || !data) break
    rows.push(...data)
    if (data.length < pageSize) break
  }
  return rows
}

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

  const termKey = getCurrentTermKey()
  const year    = getCurrentAcademicYear()

  const nowMs        = Date.now()
  const weekAgoMs    = nowMs - 7 * 24 * 60 * 60 * 1000
  const twoWeeksAgo  = new Date(nowMs - 14 * 24 * 60 * 60 * 1000).toISOString()

  // BUG 7 FIX: fetch all counts in parallel
  const [
    { count: studentCount },
    { count: teacherCount },
    { count: classCount },
    { data: results },
    { data: feeStructures },
    recentPaymentRows,
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
    // Fee structures for the selected term/year; their ids scope the invoices.
    supabase.from('fee_structures').select('id')
      .eq('school_id', schoolId).eq('term', termKey).eq('academic_year', year),
    // Payments from the last 14 days, used for the real week-over-week change.
    fetchAllRows((from, to) =>
      supabase.from('payments').select('paid_at, amount_paid_ngn')
        .eq('school_id', schoolId).gte('paid_at', twoWeeksAgo)
        .order('paid_at', { ascending: false }).range(from, to)
    ),
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

  // Fee collection for the selected term: sum over the live `payment_invoices`
  // table (amount due vs amount paid), scoped through fee_structures.
  const feeStructureIds = (feeStructures ?? []).map((f: any) => f.id)
  const invoiceRows = feeStructureIds.length
    ? await fetchAllRows((from, to) =>
        supabase.from('payment_invoices').select('amount_due_ngn, amount_paid_ngn')
          .eq('school_id', schoolId).in('fee_structure_id', feeStructureIds)
          .range(from, to)
      )
    : []

  const feeTotals = invoiceRows.reduce(
    (acc: { due: number; paid: number }, r: any) => {
      acc.due  += Number(r.amount_due_ngn)  || 0
      acc.paid += Number(r.amount_paid_ngn) || 0
      return acc
    },
    { due: 0, paid: 0 }
  )
  const feeCollectionRate = feeTotals.due > 0
    ? Math.round((feeTotals.paid / feeTotals.due) * 100)
    : 0

  // Real week-over-week movement from the `payments` table (money actually
  // received), not an estimate: last 7 days vs the 7 days before that.
  let collected7d = 0
  let collectedPrev7d = 0
  for (const p of recentPaymentRows) {
    const amt = Number(p.amount_paid_ngn) || 0
    const t = p.paid_at ? new Date(p.paid_at).getTime() : NaN
    if (Number.isNaN(t)) continue
    if (t >= weekAgoMs) collected7d += amt
    else collectedPrev7d += amt
  }

  // Currency formatting, not just the rate - prompt §6 wants the actual
  // amounts ("Fees Collected ₦24.8M", "Outstanding Fees ₦4.2M").
  const nairaCompact = (n: number) => new Intl.NumberFormat('en-NG', {
    style: 'currency', currency: 'NGN', notation: 'compact', maximumFractionDigits: 1,
  }).format(n)
  const outstandingFees = Math.max(0, feeTotals.due - feeTotals.paid)
  const feesCollectedDisplay = nairaCompact(feeTotals.paid)
  const outstandingFeesDisplay = nairaCompact(outstandingFees)
  const collected7dDisplay = nairaCompact(collected7d)

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
        outstandingFees,
        outstandingFeesDisplay,
        termLabel:      `${TERM_LABELS[termKey] ?? 'This term'} ${year}`,
        collected7d,
        collectedPrev7d,
        collected7dDisplay,
        pendingActions: (unreadNotifCount ?? 0),
      }}
      activities={activities}
      pendingNotifications={pendingNotifications}
      unreadNotifCount={unreadNotifCount ?? 0}
    />
  )
}
