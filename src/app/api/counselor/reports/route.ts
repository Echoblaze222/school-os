// src/app/api/counselor/reports/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAppointment } from '@/lib/permissions'

// Aggregate-only. Every number here is derived from the counselor's own
// caseload (RLS-scoped) and no row-level student detail is returned,
// this route is safe to eventually widen to a principal-facing summary
// later without a rewrite, since it never leaks case content, only counts.
export async function GET() {
  const supabase = await createClient()
  const caller = await requireAppointment(supabase, 'counselor')
  if (!caller) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [{ data: cases }, { data: sessions }, { data: followUps }, { data: referrals }] = await Promise.all([
    supabase.from('counseling_cases')
      .select('status, category, risk_level, opened_at, closed_at')
      .eq('counselor_profile_id', caller.userId),
    supabase.from('counseling_sessions')
      .select('status')
      .eq('counselor_profile_id', caller.userId),
    supabase.from('counseling_follow_ups')
      .select('status, due_at')
      .eq('counselor_profile_id', caller.userId),
    supabase.from('counseling_referrals')
      .select('status')
      .eq('school_id', caller.schoolId)
      .or(`referred_to_profile_id.eq.${caller.userId},referred_to_profile_id.is.null`),
  ])

  const caseRows = cases ?? []
  const byCategory: Record<string, number> = {}
  const byRisk: Record<string, number> = { low: 0, moderate: 0, high: 0 }
  let closedWithDuration = 0
  let totalDurationDays = 0

  for (const c of caseRows) {
    byCategory[c.category] = (byCategory[c.category] ?? 0) + 1
    byRisk[c.risk_level] = (byRisk[c.risk_level] ?? 0) + 1
    if (c.status === 'closed' && c.closed_at) {
      const days = (new Date(c.closed_at).getTime() - new Date(c.opened_at).getTime()) / (1000 * 60 * 60 * 24)
      if (days >= 0) {
        totalDurationDays += days
        closedWithDuration += 1
      }
    }
  }

  const sessionRows = sessions ?? []
  const followUpRows = followUps ?? []
  const doneFollowUps = followUpRows.filter((f: any) => f.status === 'done').length

  return NextResponse.json({
    totalCases: caseRows.length,
    openCases: caseRows.filter((c: any) => c.status === 'open').length,
    monitoringCases: caseRows.filter((c: any) => c.status === 'monitoring').length,
    closedCases: caseRows.filter((c: any) => c.status === 'closed').length,
    casesByCategory: byCategory,
    casesByRisk: byRisk,
    averageDaysToClose: closedWithDuration ? Math.round(totalDurationDays / closedWithDuration) : null,
    totalSessions: sessionRows.length,
    completedSessions: sessionRows.filter((s: any) => s.status === 'completed').length,
    noShowSessions: sessionRows.filter((s: any) => s.status === 'no_show').length,
    followUpCompletionRate: followUpRows.length ? Math.round((doneFollowUps / followUpRows.length) * 100) : null,
    referrals: {
      total: (referrals ?? []).length,
      pending: (referrals ?? []).filter((r: any) => r.status === 'pending').length,
      converted: (referrals ?? []).filter((r: any) => r.status === 'converted_to_case').length,
    },
  })
}
