// app/api/trial/check/route.ts
// On-demand check for a single school - still useful for instant UI feedback
// right after a student/teacher/etc. loads their dashboard. The authoritative,
// always-runs-regardless-of-who-logs-in check is the cron job at
// /api/cron/check-subscriptions (see vercel.json).
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { evaluateSchoolSubscription } from '@/lib/subscriptionExpiry'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { schoolId } = await req.json()

  if (!schoolId) return NextResponse.json({ error: 'schoolId required' }, { status: 400 })

  const { data: school } = await supabase
    .from('schools')
    .select('id, name, setup_status, trial_ends_at, free_month_ends, subscription_ends')
    .eq('id', schoolId)
    .single()

  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 })

  const result = await evaluateSchoolSubscription(supabase, school)

  return NextResponse.json({ ok: true, updated: result.updated, school: { ...school, setup_status: result.status } })
}
