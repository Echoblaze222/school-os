// src/app/api/cron/check-subscriptions/route.ts
// Vercel Cron Job - runs on a schedule regardless of whether anyone logs in.
// Configure in vercel.json:
// { "path": "/api/cron/check-subscriptions", "schedule": "0 * * * *" }
//
// This is the fix for: "school still works after subscription expires."
// Previously, expiry was only ever computed inside /api/trial/check, which
// was only triggered by an un-awaited fetch() on the STUDENT dashboard page.
// If no student logged in that day (e.g. only the principal was using the
// app), setup_status never flipped from 'trial'/'active' to
// 'expired'/'suspended' - so nothing ever locked, for anyone.
//
// This job sweeps every trial/active school on a timer, so expiry no longer
// depends on any particular role loading any particular page.
//
// Protected by CRON_SECRET env var (same pattern as /api/cron/reminders).

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { evaluateSchoolSubscription } from '@/lib/subscriptionExpiry'

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Only trial/active schools can possibly need a status flip - schools
  // already expired/suspended/locked don't need re-checking here.
  const { data: schools, error } = await admin
    .from('schools')
    .select('id, name, setup_status, trial_ends_at, free_month_ends, subscription_ends')
    .in('setup_status', ['trial', 'active'])

  if (error) {
    console.error('[cron/check-subscriptions] fetch error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let checked = 0
  let flipped = 0
  const flippedSchools: { id: string; name: string; status: string }[] = []

  for (const school of schools ?? []) {
    checked++
    try {
      const result = await evaluateSchoolSubscription(admin, school)
      if (result.updated) {
        flipped++
        flippedSchools.push({ id: school.id, name: school.name, status: result.status })
      }
    } catch (err: any) {
      console.error(`[cron/check-subscriptions] failed for school ${school.id}:`, err.message)
    }
  }

  return NextResponse.json({ ok: true, checked, flipped, flippedSchools })
}
