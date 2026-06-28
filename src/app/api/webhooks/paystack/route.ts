// app/api/webhooks/paystack/route.ts
// Paystack POSTs here on EVERY payment event.
// We verify the HMAC signature, then activate the subscription.
//
// Set this URL in Paystack Dashboard → Settings → API Keys & Webhooks:
//   https://school-os-j4bn.vercel.app/api/webhooks/paystack
//
// Required env var: PAYSTACK_SECRET_KEY

import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { activateSubscription } from '@/app/api/subscription/callback/route'

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY ?? ''

function verifySignature(rawBody: string, signature: string): boolean {
  const hash = crypto
    .createHmac('sha512', PAYSTACK_SECRET)
    .update(rawBody)
    .digest('hex')
  return hash === signature
}

export async function POST(req: Request) {
  const rawBody   = await req.text()
  const signature = req.headers.get('x-paystack-signature') ?? ''

  if (!verifySignature(rawBody, signature)) {
    console.warn('[paystack-webhook] Invalid signature — rejected')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event: any
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Only handle successful charges
  if (event.event !== 'charge.success') {
    return NextResponse.json({ received: true })
  }

  const tx        = event.data
  const reference = tx.reference as string
  const amountNgn = Number(tx.amount) / 100
  const metadata  = tx.metadata ?? {}
  const school_id = metadata.school_id as string | undefined
  const plan_type = (metadata.plan_type as string) ?? 'Standard'

  if (!school_id) {
    console.warn('[paystack-webhook] Payment received without school_id:', reference)
    return NextResponse.json({ received: true })
  }

  const adminSupabase = createAdminClient()

  // Idempotency — skip if already processed
  const { data: alreadyProcessed } = await adminSupabase
    .from('subscriptions')
    .select('id')
    .eq('payment_reference', reference)
    .maybeSingle()

  if (alreadyProcessed) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  try {
    await activateSubscription({
      adminSupabase,
      school_id,
      plan_type,
      amount_ngn:    amountNgn,
      reference,
      student_count: metadata.student_count,
      principal_id:  metadata.principal_id,
    })

    console.log(`[paystack-webhook] School ${school_id} activated via ${reference}`)
    return NextResponse.json({ received: true, ok: true })

  } catch (err) {
    console.error('[paystack-webhook] activation error:', err)
    return NextResponse.json({ received: true, error: 'Activation failed' }, { status: 500 })
  }
      }
      
