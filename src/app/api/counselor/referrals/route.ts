// src/app/api/counselor/referrals/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerContext, requireAppointment } from '@/lib/permissions'
import { notifyUser } from '@/lib/notify/notifyUser'

// GET, the counselor's intake queue (referrals addressed to them, or
// unassigned at their school). Requires an active counselor appointment.
export async function GET(request: Request) {
  const supabase = await createClient()
  const caller = await requireAppointment(supabase, 'counselor')
  if (!caller) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') ?? 'pending'

  const { data, error } = await supabase
    .from('counseling_referrals')
    .select(`
      id, reason, urgency, status, created_at,
      student:profiles!counseling_referrals_student_profile_id_fkey ( id, full_name, class_level ),
      referrer:profiles!counseling_referrals_referred_by_profile_id_fkey ( id, full_name, role )
    `)
    .eq('school_id', caller.schoolId)
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: 'Could not load referrals right now.' }, { status: 500 })
  }

  return NextResponse.json({ referrals: data ?? [] })
}

// POST, submit a referral. Any authenticated staff member or parent at
// the school may do this; it does not require the counselor appointment.
// A simple per-user rate limit guards against abuse of a route that's
// intentionally open to a wide set of roles.
export async function POST(request: Request) {
  const supabase = await createClient()
  const caller = await getCallerContext(supabase)
  if (!caller || !caller.schoolId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // A simple per-user rate limit guards against abuse of a route that's
  // intentionally open to a wide set of roles. check_rate_limit() is
  // service_role-only (see docs/security-hotfix), so this check runs on
  // the admin client, not the RLS-bound one used for the actual insert
  // below. Fails open on an unexpected DB error, same policy as the
  // existing ai_check_rate_limit usage, so an outage here never blocks a
  // legitimate referral.
  const rateLimitAdmin = createAdminClient()
  const { data: withinLimit, error: rateErr } = await rateLimitAdmin.rpc('check_rate_limit', {
    p_scope: 'counseling_referral_submit',
    p_identifier: caller.userId,
    p_limit: 10,
    p_window_seconds: 3600,
  })
  if (!rateErr && withinLimit === false) {
    return NextResponse.json(
      { error: 'Too many referrals submitted recently. Please try again in a while.' },
      { status: 429 }
    )
  }

  const { studentId, reason, urgency } = await request.json()
  if (!studentId || !reason?.trim()) {
    return NextResponse.json({ error: 'A student and a reason are required.' }, { status: 400 })
  }
  if (reason.length > 2000) {
    return NextResponse.json({ error: 'Reason is too long. Keep it under 2000 characters.' }, { status: 400 })
  }

  const { data: student } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', studentId)
    .eq('school_id', caller.schoolId)
    .eq('role', 'student')
    .maybeSingle()

  if (!student) {
    return NextResponse.json({ error: 'Student not found at this school.' }, { status: 404 })
  }

  const { data: created, error } = await supabase
    .from('counseling_referrals')
    .insert({
      school_id: caller.schoolId,
      student_profile_id: studentId,
      referred_by_profile_id: caller.userId,
      reason: reason.trim(),
      urgency: ['normal', 'elevated', 'urgent'].includes(urgency) ? urgency : 'normal',
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: 'Could not submit the referral. Please try again.' }, { status: 500 })
  }

  // Notify every active counselor at the school that a new referral is
  // waiting, without putting the reason in the notification body.
  try {
    const admin = createAdminClient()
    const { data: counselors } = await admin
      .from('appointments')
      .select('profile_id')
      .eq('school_id', caller.schoolId)
      .eq('appointment_type', 'counselor')
      .eq('status', 'active')

    await Promise.all(
      (counselors ?? []).map((c: any) =>
        notifyUser({
          recipientId: c.profile_id,
          schoolId: caller.schoolId!,
          title: 'New counseling referral',
          body: 'A new student referral is waiting in your queue.',
          type: 'counseling_referral',
          linkUrl: '/dashboard/counselor/referrals',
          referenceId: created.id,
          referenceTable: 'counseling_referrals',
        }).catch(() => {})
      )
    )
  } catch { /* notification delivery is best-effort */ }

  return NextResponse.json({ id: created.id })
}
