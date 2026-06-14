// app/api/super-admin/manage-school/route.ts
//
// Single endpoint for every school-management mutation that used to happen
// directly from the browser via the anon client. Every operation here:
//   1. Re-verifies the caller is a super-admin on EVERY request (not just page load)
//   2. Uses createAdminClient() (service-role) so RLS cannot block legitimate ops
//   3. Returns a consistent { ok, error } shape the UI can rely on

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Supported actions ────────────────────────────────────────────────────────
type Action =
  | 'extend_trial'         // extend trial_ends_at by N days
  | 'toggle_lock'          // flip active ↔ locked
  | 'save_notes'           // update private notes field
  | 'confirm_setup'        // mark setup paid → active + 1 month free
  | 'confirm_subscription' // log subscription payment → extend access
  | 'delete_school'        // permanently delete school + cascade

interface Body {
  action:     Action
  school_id:  string
  // extend_trial
  days?:      number
  // confirm_setup
  amount_ngn?:  number
  payment_ref?: string
  // confirm_subscription
  plan?:       string
  // save_notes
  notes?:     string
}

// ─── Helper: notify the school's principal ───────────────────────────────────
async function notifyPrincipal(
  admin: ReturnType<typeof createAdminClient>,
  schoolId: string,
  title: string,
  body: string,
) {
  const { data: principal } = await admin
    .from('profiles').select('id')
    .eq('school_id', schoolId).eq('role', 'principal').single()

  if (principal) {
    await admin.from('notifications').insert({
      user_id:   principal.id,
      school_id: schoolId,
      title,
      body,
      type: 'system',
    })
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  // 1. Verify session
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Verify super-admin on EVERY call (not just page-load)
  const admin = createAdminClient()
  const { data: sa } = await admin
    .from('platform_admins').select('id').eq('id', user.id).single()
  if (!sa) {
    return NextResponse.json({ error: 'Forbidden: not a super-admin' }, { status: 403 })
  }

  // 3. Parse body
  let body: Body
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { action, school_id } = body
  if (!action)    return NextResponse.json({ error: 'action is required' },    { status: 400 })
  if (!school_id) return NextResponse.json({ error: 'school_id is required' }, { status: 400 })

  // 4. Verify school exists
  const { data: school } = await admin
    .from('schools').select('id, name, trial_ends_at, setup_status').eq('id', school_id).single()
  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 })

  // ── EXTEND TRIAL ─────────────────────────────────────────────────────────
  if (action === 'extend_trial') {
    const days = body.days ?? 5
    if (days < 1 || days > 90) {
      return NextResponse.json({ error: 'days must be between 1 and 90' }, { status: 400 })
    }
    const current = school.trial_ends_at ? new Date(school.trial_ends_at).getTime() : Date.now()
    const newEnd  = new Date(Math.max(Date.now(), current) + days * 86_400_000)

    const { error } = await admin.from('schools').update({
      trial_ends_at:  newEnd.toISOString(),
      trial_extended: true,
    }).eq('id', school_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await notifyPrincipal(admin, school_id,
      '⏰ Trial Extended',
      `Great news! Your free trial has been extended by ${days} days.`,
    )
    return NextResponse.json({ ok: true, trial_ends_at: newEnd.toISOString() })
  }

  // ── TOGGLE LOCK ───────────────────────────────────────────────────────────
  if (action === 'toggle_lock') {
    const next = school.setup_status === 'locked' ? 'active' : 'locked'
    const { error } = await admin.from('schools')
      .update({ setup_status: next }).eq('id', school_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, setup_status: next })
  }

  // ── SAVE NOTES ────────────────────────────────────────────────────────────
  if (action === 'save_notes') {
    const { error } = await admin.from('schools')
      .update({ notes: body.notes ?? '' }).eq('id', school_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  }

  // ── CONFIRM SETUP PAYMENT → ACTIVATE ──────────────────────────────────────
  if (action === 'confirm_setup') {
    const now          = new Date()
    const freeMonthEnd = new Date(now.getTime() + 30 * 86_400_000)

    const { error: schoolErr } = await admin.from('schools').update({
      setup_status:      'active',
      setup_paid_at:     now.toISOString(),
      free_month_starts: now.toISOString(),
      free_month_ends:   freeMonthEnd.toISOString(),
      subscription_plan: 'free_month',
    }).eq('id', school_id)
    if (schoolErr) return NextResponse.json({ error: schoolErr.message }, { status: 500 })

    // Log payment if amount provided
    if (body.amount_ngn && body.amount_ngn > 0) {
      await admin.from('school_payments').insert({
        school_id,
        payment_type: 'setup',
        amount_ngn:   body.amount_ngn,
        payment_ref:  body.payment_ref ?? null,
        confirmed_by: user.id,
      })
    }

    await notifyPrincipal(admin, school_id,
      '🎉 Setup Complete!',
      'Your payment has been confirmed. You now have 1 month of free access to all features.',
    )
    return NextResponse.json({ ok: true })
  }

  // ── CONFIRM SUBSCRIPTION PAYMENT ──────────────────────────────────────────
  if (action === 'confirm_subscription') {
    const plan = body.plan ?? 'basic_500'
    const now     = new Date()
    const sub_end = new Date(now.getTime() + 30 * 86_400_000)

    const { error: schoolErr } = await admin.from('schools').update({
      setup_status:        'active',
      subscription_plan:   plan,
      subscription_starts: now.toISOString(),
      subscription_ends:   sub_end.toISOString(),
      next_payment_due:    sub_end.toISOString(),
    }).eq('id', school_id)
    if (schoolErr) return NextResponse.json({ error: schoolErr.message }, { status: 500 })

    if (body.amount_ngn && body.amount_ngn > 0) {
      await admin.from('school_payments').insert({
        school_id,
        payment_type: 'subscription',
        amount_ngn:   body.amount_ngn,
        payment_ref:  body.payment_ref ?? null,
        plan,
        confirmed_by: user.id,
      })
    }

    const PLAN_LABELS: Record<string, string> = {
      free_month: '1 Month Free', basic_500: '₦500/mo Basic',
      standard_1000: '₦1,000/mo Standard', premium_2000: '₦2,000/mo Premium',
      installment_3month: 'Installment Plan',
    }
    await notifyPrincipal(admin, school_id,
      '✅ Subscription Active',
      `Your ${PLAN_LABELS[plan] ?? plan} subscription is now active. Next payment due in 30 days.`,
    )
    return NextResponse.json({ ok: true })
  }

  // ── DELETE SCHOOL ─────────────────────────────────────────────────────────
  if (action === 'delete_school') {
    // Delete auth users for all staff before deleting school
    // (profiles rows cascade-delete with school, but auth.users do not)
    const { data: staff } = await admin
      .from('profiles').select('id').eq('school_id', school_id)

    if (staff && staff.length > 0) {
      for (const member of staff) {
        await admin.auth.admin.deleteUser(member.id)
      }
    }

    const { error } = await admin.from('schools').delete().eq('id', school_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
}
