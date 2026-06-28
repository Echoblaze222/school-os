// app/api/webhooks/paystack/route.ts
//
// Paystack sends a POST here every time a payment succeeds.
// Set your Paystack webhook URL in the Paystack dashboard to:
//   https://your-domain.vercel.app/api/webhooks/paystack
//
// Set PAYSTACK_SECRET_KEY in your Vercel env vars.

import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY ?? ''

function verifySignature(body: string, signature: string): boolean {
  const expected = crypto
    .createHmac('sha512', PAYSTACK_SECRET)
    .update(body)
    .digest('hex')
  return expected === signature
}

export async function POST(req: Request) {
  const rawBody  = await req.text()
  const signature = req.headers.get('x-paystack-signature') ?? ''

  // Always verify — reject anything unsigned
  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event: any
  try { event = JSON.parse(rawBody) } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // We only care about successful charges
  if (event.event !== 'charge.success') {
    return NextResponse.json({ received: true })
  }

  const data      = event.data
  const reference = data.reference as string
  const amountNgn = Number(data.amount) / 100          // Paystack sends kobo
  const metadata  = data.metadata ?? {}

  // Expect school_id to be passed as Paystack metadata.school_id
  // (set this when initialising the Paystack transaction on your frontend)
  const school_id = metadata.school_id as string | undefined
  const plan      = (metadata.plan as string) ?? 'basic_500'

  if (!school_id) {
    // No school_id in metadata — log and ignore
    console.warn('Paystack webhook: payment without school_id', reference)
    return NextResponse.json({ received: true })
  }

  const adminSupabase = createAdminClient()
  const now           = new Date()

  // Check if this reference was already processed (idempotency)
  const { data: existing } = await adminSupabase
    .from('school_payments')
    .select('id')
    .eq('payment_ref', reference)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  // Determine subscription window from plan
  const cycleMonths: Record<string, number> = {
    basic_500: 1, standard_1000: 1, premium_2000: 1, installment_3month: 3,
  }
  const months = cycleMonths[plan] ?? 1
  const subEnd = new Date(now.getTime() + months * 30 * 86_400_000)

  // Determine whether this is a setup payment or a subscription renewal
  const { data: school } = await adminSupabase
    .from('schools')
    .select('setup_status, setup_paid_at, subscription_plan')
    .eq('id', school_id)
    .single()

  if (!school) {
    return NextResponse.json({ received: true, error: 'School not found' })
  }

  const isSetupPayment = !school.setup_paid_at

  if (isSetupPayment) {
    // First-ever payment → grant 1 month free then subscription
    const freeEnd = new Date(now.getTime() + 30 * 86_400_000)
    await adminSupabase
      .from('schools')
      .update({
        setup_status:       'active',
        is_platform_active: true,
        setup_paid_at:      now.toISOString(),
        subscription_plan:  'free_month',
        free_month_starts:  now.toISOString(),
        free_month_ends:    freeEnd.toISOString(),
        subscription_starts: now.toISOString(),
        subscription_ends:  freeEnd.toISOString(),
        next_payment_due:   freeEnd.toISOString(),
        updated_at:         now.toISOString(),
      })
      .eq('id', school_id)

    await adminSupabase.from('school_payments').insert({
      school_id,
      payment_type: 'setup',
      amount_ngn:   amountNgn,
      payment_ref:  reference,
      confirmed_at: now.toISOString(),
    })
  } else {
    // Renewal payment → extend/activate subscription
    await adminSupabase
      .from('schools')
      .update({
        setup_status:       'active',
        is_platform_active: true,
        subscription_plan:  plan,
        subscription_starts: now.toISOString(),
        subscription_ends:  subEnd.toISOString(),
        next_payment_due:   subEnd.toISOString(),
        updated_at:         now.toISOString(),
      })
      .eq('id', school_id)

    await adminSupabase.from('school_payments').insert({
      school_id,
      payment_type: 'subscription',
      plan,
      amount_ngn:   amountNgn,
      payment_ref:  reference,
      confirmed_at: now.toISOString(),
    })
  }

  // Log audit
  await adminSupabase.from('portal_audit_log').insert({
    action:       'paystack_payment_received',
    target_table: 'schools',
    target_id:    school_id,
    metadata:     { reference, amount_ngn: amountNgn, plan, is_setup: isSetupPayment },
  })

  return NextResponse.json({ received: true, ok: true })
}
