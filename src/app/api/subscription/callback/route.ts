// app/api/subscription/callback/route.ts
// Paystack redirects HERE after the user completes (or cancels) payment.
// This is NOT the webhook — it's the browser redirect.
// We verify the transaction, then redirect the principal to their subscription
// page with a ?status= param so the toast message shows.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeSubscriptionAmount, type BillingCycle } from '@/lib/billing'

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!
const APP_URL         = process.env.NEXT_PUBLIC_APP_URL ?? 'https://school-os-sphg.vercel.app'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const reference        = searchParams.get('reference') ?? searchParams.get('trxref')

  const redirectBase = `${APP_URL}/dashboard/principal/subscription`

  if (!reference) {
    return NextResponse.redirect(`${redirectBase}?status=failed`)
  }

  try {
    // Verify transaction with Paystack
    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    )
    const verifyData = await verifyRes.json()

    if (!verifyData.status || verifyData.data?.status !== 'success') {
      return NextResponse.redirect(`${redirectBase}?status=failed`)
    }

    const txData      = verifyData.data
    const metadata    = txData.metadata ?? {}
    const school_id   = metadata.school_id
    const amount_ngn  = Number(txData.amount) / 100

    if (!school_id) {
      return NextResponse.redirect(`${redirectBase}?status=failed`)
    }

    const adminSupabase = createAdminClient()

    // Check idempotency — don't process twice
    const { data: existing } = await adminSupabase
      .from('subscriptions')
      .select('id')
      .eq('payment_reference', reference)
      .maybeSingle()

    if (!existing) {
      const result = await activateSubscription({
        adminSupabase, school_id, amount_ngn, reference,
        principal_id: metadata.principal_id,
      })
      if (!result.activated) {
        console.warn(`[subscription/callback] activation refused: ${result.reason}`)
        return NextResponse.redirect(`${redirectBase}?status=failed`)
      }
    }

    return NextResponse.redirect(
      `${redirectBase}?status=success&receipt=${encodeURIComponent(reference)}`
    )

  } catch (err) {
    console.error('[callback] error:', err)
    return NextResponse.redirect(`${redirectBase}?status=failed`)
  }
}

// ─── Shared activation logic (also used by /api/webhooks/paystack) ──────────
//
// This used to take plan_type/amount_ngn/student_count straight from the
// caller, which took them straight from Paystack's echoed-back metadata.
// That metadata is genuinely un-tamperable *within this app's own flows*
// (every reference this app generates is server-side, never client-
// supplied), but it was never actually checked to have come from THIS
// flow at all. Any successful Paystack transaction on the account -
// including a parent's small fee payment, which also carries a school_id
// in its metadata (see /api/payments/initialize/route.ts) - satisfied
// every check this function used to make, and activated the school's
// subscription for whatever tiny amount that unrelated transaction
// happened to be for.
//
// The fix is to require a matching row in subscription_payments, keyed by
// paystack_reference, that /api/subscription/renew/route.ts already
// inserts *before* redirecting to Paystack with the server-calculated
// price for this exact reference. No such row means this reference did
// not originate from a subscription renewal, full stop - a parent's fee-
// payment reference will never have one, no matter what metadata it
// carries. Where a row does exist, it (not the metadata that came back
// through Paystack) is the source of truth for plan/student count/amount,
// and the Paystack-verified amount actually charged must meet or exceed
// what that row expected.
const SUBSCRIPTION_REFERENCE_PREFIX = 'SCOS-'
const AMOUNT_TOLERANCE_NGN = 1 // absorb sub-naira/kobo rounding only

export interface ActivateSubscriptionResult {
  activated: boolean
  reason?: string
}

export async function activateSubscription({
  adminSupabase,
  school_id,
  amount_ngn,
  reference,
  principal_id,
}: {
  adminSupabase:  any
  school_id:      string
  amount_ngn:     number
  reference:      string
  principal_id?:  string
}): Promise<ActivateSubscriptionResult> {
  if (!reference || !reference.startsWith(SUBSCRIPTION_REFERENCE_PREFIX)) {
    console.warn(`[activateSubscription] Refusing ${school_id}: reference "${reference}" isn't a renewal reference.`)
    return { activated: false, reason: 'reference_not_from_renewal_flow' }
  }

  const { data: pending } = await adminSupabase
    .from('subscription_payments')
    .select('school_id, amount_paid, plan_type, student_count, billing_cycle')
    .eq('paystack_reference', reference)
    .maybeSingle()

  if (!pending) {
    console.warn(`[activateSubscription] Refusing ${school_id}: no pending payment logged for "${reference}".`)
    return { activated: false, reason: 'no_matching_pending_payment' }
  }
  if (pending.school_id !== school_id) {
    console.warn(`[activateSubscription] Refusing: reference "${reference}" belongs to a different school.`)
    return { activated: false, reason: 'school_mismatch' }
  }
  if (amount_ngn < Number(pending.amount_paid) - AMOUNT_TOLERANCE_NGN) {
    console.warn(`[activateSubscription] Refusing ${school_id}: paid ₦${amount_ngn}, expected ₦${pending.amount_paid}.`)
    return { activated: false, reason: 'amount_below_expected' }
  }

  const plan_type     = pending.plan_type
  const student_count = pending.student_count ?? undefined
  // Pre-log rows written before this field existed default to 'termly'
  // via the column default, so this is safe for in-flight payments too.
  const billing_cycle: BillingCycle = pending.billing_cycle === 'yearly' ? 'yearly' : 'termly'

  const now        = new Date()
  const expiryDate = new Date(now)
  // Termly = one 4-month term. Yearly = a full 12-month academic year
  // (the 3-term-equivalent the yearly discount in lib/billing.ts is
  // priced against) - getting this wrong in either direction either
  // shortchanges the school on what they paid for or gives away months
  // for free, so it comes from the same billing_cycle used to calculate
  // the price, not guessed from plan_type the way it used to be.
  expiryDate.setMonth(expiryDate.getMonth() + (billing_cycle === 'yearly' ? 12 : 4))

  const periodStart = now.toISOString().split('T')[0]
  const periodEnd    = expiryDate.toISOString().split('T')[0]

  // 1. Upsert the subscriptions row for this school
  const { data: existingSub } = await adminSupabase
    .from('subscriptions')
    .select('id')
    .eq('school_id', school_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let subscriptionId: string | undefined = existingSub?.id

  if (existingSub) {
    await adminSupabase
      .from('subscriptions')
      .update({
        plan_type:         plan_type,
        status:            'Active',
        billing_cycle,
        started_at:        periodStart,
        expiry_date:       periodEnd,
        amount_paid:       amount_ngn,
        currency_used:     'NGN',
        payment_reference: reference,
        // Paying (whether a fresh renewal or one made while cancel_at_period_end
        // was set) means the school wants to continue - always clear it here
        // rather than requiring a separate "undo cancellation" step.
        cancel_at_period_end: false,
        updated_at:        now.toISOString(),
      })
      .eq('id', existingSub.id)
  } else {
    const { data: inserted } = await adminSupabase
      .from('subscriptions')
      .insert({
        school_id,
        plan_type,
        status:            'Active',
        billing_cycle,
        started_at:        periodStart,
        expiry_date:       periodEnd,
        amount_paid:       amount_ngn,
        currency_used:     'NGN',
        payment_reference: reference,
        cancel_at_period_end: false,
      })
      .select('id')
      .single()
    subscriptionId = inserted?.id
  }

  // 2. Unlock the school in the schools table, and reset the anti-gaming
  //    peak-count tracker so it starts fresh for this new period rather
  //    than carrying forward a stale peak from whenever it was last set.
  await adminSupabase
    .from('schools')
    .update({
      setup_status:               'active',
      is_platform_active:         true,
      peak_active_student_count:  student_count ?? null,
      updated_at:                 now.toISOString(),
    })
    .eq('id', school_id)

  // 3. Record in subscription_payments (update the pre-log row if it exists)
  await adminSupabase
    .from('subscription_payments')
    .upsert({
      school_id,
      amount_paid:        amount_ngn,
      currency_used:      'NGN',
      plan_type,
      student_count:      student_count ?? null,
      billing_cycle,
      receipt_number:     reference,
      paystack_reference: reference,
      paid_at:            now.toISOString(),
    }, { onConflict: 'receipt_number' })

  // 4. Billing snapshot - a locked, principal-visible record of what this
  //    specific period cost and why, independent of the payment-attempt
  //    row above. Written once, never updated afterward.
  if (student_count) {
    const breakdown = computeSubscriptionAmount(student_count, billing_cycle)
    await adminSupabase.from('subscription_billing_snapshots').insert({
      school_id,
      subscription_id:        subscriptionId ?? null,
      billing_cycle,
      live_student_count:     student_count,
      billable_student_count: student_count,
      rate_per_student:       breakdown.ratePerStudent,
      tier_label:             breakdown.tierLabel,
      amount_ngn:             amount_ngn,
      discount_applied_ngn:   breakdown.discountApplied,
      period_start:           periodStart,
      period_end:             periodEnd,
      paystack_reference:     reference,
    })
  }

  // 5. Log audit
  await adminSupabase.from('portal_audit_log').insert({
    actor_id:     principal_id ?? null,
    action:       'subscription_payment_confirmed',
    target_table: 'subscriptions',
    target_id:    school_id,
    metadata:     { reference, amount_ngn, plan_type, billing_cycle },
  })

  return { activated: true }
}
