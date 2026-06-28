// app/api/subscription/callback/route.ts
// Paystack redirects HERE after the user completes (or cancels) payment.
// This is NOT the webhook — it's the browser redirect.
// We verify the transaction, then redirect the principal to their subscription
// page with a ?status= param so the toast message shows.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
    const plan_type   = metadata.plan_type   ?? 'Standard'
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
      // Activate the subscription
      await activateSubscription({
        adminSupabase,
        school_id,
        plan_type,
        amount_ngn,
        reference,
        student_count: metadata.student_count,
        principal_id:  metadata.principal_id,
      })
    }

    return NextResponse.redirect(
      `${redirectBase}?status=success&receipt=${encodeURIComponent(reference)}`
    )

  } catch (err) {
    console.error('[callback] error:', err)
    return NextResponse.redirect(`${redirectBase}?status=failed`)
  }
}

// ─── Shared activation logic (also used by webhook) ──────────────────────────
export async function activateSubscription({
  adminSupabase,
  school_id,
  plan_type,
  amount_ngn,
  reference,
  student_count,
  principal_id,
}: {
  adminSupabase:  any
  school_id:      string
  plan_type:      string
  amount_ngn:     number
  reference:      string
  student_count?: number
  principal_id?:  string
}) {
  const now        = new Date()
  // One term = 4 months
  const expiryDate = new Date(now)
  expiryDate.setMonth(expiryDate.getMonth() + 4)

  // Determine billing cycle label from plan
  const termMap: Record<string, string> = {
    basic_500: 'Termly', standard_1000: 'Termly', premium_2000: 'Termly',
    Basic: 'Termly', Standard: 'Termly', Premium: 'Termly',
  }

  // 1. Upsert the subscriptions row for this school
  const { data: existingSub } = await adminSupabase
    .from('subscriptions')
    .select('id')
    .eq('school_id', school_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingSub) {
    await adminSupabase
      .from('subscriptions')
      .update({
        plan_type:         plan_type,
        status:            'Active',
        billing_cycle:     termMap[plan_type] ?? 'Termly',
        started_at:        now.toISOString().split('T')[0],
        expiry_date:       expiryDate.toISOString().split('T')[0],
        amount_paid:       amount_ngn,
        currency_used:     'NGN',
        payment_reference: reference,
        updated_at:        now.toISOString(),
      })
      .eq('id', existingSub.id)
  } else {
    await adminSupabase
      .from('subscriptions')
      .insert({
        school_id,
        plan_type,
        status:            'Active',
        billing_cycle:     termMap[plan_type] ?? 'Termly',
        started_at:        now.toISOString().split('T')[0],
        expiry_date:       expiryDate.toISOString().split('T')[0],
        amount_paid:       amount_ngn,
        currency_used:     'NGN',
        payment_reference: reference,
      })
  }

  // 2. Unlock the school in the schools table
  await adminSupabase
    .from('schools')
    .update({
      setup_status:       'active',
      is_platform_active: true,
      updated_at:         now.toISOString(),
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
      receipt_number:     reference,
      paystack_reference: reference,
      paid_at:            now.toISOString(),
    }, { onConflict: 'receipt_number' })

  // 4. Log audit
  await adminSupabase.from('portal_audit_log').insert({
    actor_id:     principal_id ?? null,
    action:       'subscription_payment_confirmed',
    target_table: 'subscriptions',
    target_id:    school_id,
    metadata:     { reference, amount_ngn, plan_type },
  })
  }
      
