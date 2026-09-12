// src/app/api/super-admin/hq/route.ts
// Backs the unlisted /super-admin/hq dashboard. Gated on is_super = true
// specifically, not just membership in platform_admins - this route (and
// the page that calls it) is intentionally not linked from anywhere in
// the admin nav.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateLoginBriefing } from '@/lib/ai/loginBriefing'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

    const adminSupabase = createAdminClient()
    const { data: sa } = await adminSupabase
      .from('platform_admins').select('is_super').eq('id', user.id).maybeSingle()
    if (!sa?.is_super) return NextResponse.json({ ok: false, error: 'Not authorized' }, { status: 403 })

    const now = new Date()
    const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0)
    const startOfYesterday = new Date(startOfToday); startOfYesterday.setDate(startOfYesterday.getDate() - 1)
    const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    // One query covers everything below - 30 days of login events is a
    // small enough row count at this stage to aggregate in memory rather
    // than writing four separate SQL aggregates to keep in sync.
    const { data: events, error } = await adminSupabase
      .from('usage_events')
      .select('user_id, school_id, role, created_at')
      .eq('event_type', 'login')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: true })
      .limit(20000)

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

    const rows = events ?? []

    const loginsToday = rows.filter(r => new Date(r.created_at) >= startOfToday).length
    const loginsYesterday = rows.filter(r => {
      const t = new Date(r.created_at)
      return t >= startOfYesterday && t < startOfToday
    }).length
    const last7 = rows.filter(r => new Date(r.created_at) >= sevenDaysAgo)
    const loginsLast7Days = last7.length
    const activeSchoolsLast7Days = new Set(last7.map(r => r.school_id).filter(Boolean)).size

    const roleCounts7d = new Map<string, number>()
    for (const r of last7) {
      if (!r.role) continue
      roleCounts7d.set(r.role, (roleCounts7d.get(r.role) ?? 0) + 1)
    }
    const topRoleLast7Days = [...roleCounts7d.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    // Histogram: logins by hour of day, last 7 days.
    const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }))
    for (const r of last7) hourly[new Date(r.created_at).getHours()].count++

    // Line chart: distinct logged-in users per day, last 30 days.
    const dayBuckets = new Map<string, Set<string>>()
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i)
      dayBuckets.set(d.toISOString().slice(0, 10), new Set())
    }
    for (const r of rows) {
      const key = new Date(r.created_at).toISOString().slice(0, 10)
      dayBuckets.get(key)?.add(r.user_id)
    }
    const dailyActiveUsers = [...dayBuckets.entries()].map(([date, users]) => ({ date, count: users.size }))

    const stats = { loginsToday, loginsYesterday, loginsLast7Days, activeSchoolsLast7Days, topRoleLast7Days }
    const briefing = await generateLoginBriefing(stats)

    return NextResponse.json({ ok: true, stats, briefing, hourly, dailyActiveUsers })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
