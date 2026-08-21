// src/app/api/subscription/cancel/route.ts
//
// Lets a principal turn auto-renewal off without losing access to the
// period they already paid for - the subscription stays exactly as
// active (or grace_period) as it would have; only what happens when it
// next lapses changes (see evaluateSchoolSubscription in
// lib/subscriptionExpiry.ts: a cancel_at_period_end subscription goes
// straight to 'cancelled' on lapse, skipping the grace period, since the
// school already opted out rather than simply missing a payment).
//
// "Resume" is just the same flag flipped back before the period ends -
// deliberately not a separate endpoint, since it's the same authorization
// check and the same row.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, school_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'principal') {
    return NextResponse.json({ error: 'Only principals can change auto-renewal.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const action = body?.action === 'resume' ? 'resume' : body?.action === 'cancel' ? 'cancel' : null
  if (!action) {
    return NextResponse.json({ error: "action must be 'cancel' or 'resume'." }, { status: 400 })
  }

  const adminSupabase = createAdminClient()

  const { data: sub } = await adminSupabase
    .from('subscriptions')
    .select('id, status')
    .eq('school_id', profile.school_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!sub) {
    return NextResponse.json({ error: 'No subscription found for your school.' }, { status: 404 })
  }
  if (sub.status !== 'Active') {
    // Nothing meaningful to cancel/resume once a subscription has already
    // lapsed - renewing (which creates a fresh 'Active' row) is the only
    // way back from there, not this toggle.
    return NextResponse.json(
      { error: 'Auto-renewal can only be changed while your subscription is active.' },
      { status: 400 }
    )
  }

  await adminSupabase
    .from('subscriptions')
    .update({ cancel_at_period_end: action === 'cancel' })
    .eq('id', sub.id)

  await adminSupabase.from('portal_audit_log').insert({
    actor_id:     user.id,
    action:       action === 'cancel' ? 'subscription_cancel_at_period_end' : 'subscription_resume_auto_renew',
    target_table: 'subscriptions',
    target_id:    profile.school_id,
  })

  return NextResponse.json({ ok: true, cancelAtPeriodEnd: action === 'cancel' })
}
