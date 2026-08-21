// src/app/api/payments/paystack-webhook/route.ts
//
// DEPRECATED — was also unreachable in practice: this path is not in
// PUBLIC_PATHS in src/middleware.ts, so middleware redirected every
// unauthenticated request here (including Paystack's own server-to-
// server POST, which carries no session cookie) to /login before it
// ever reached this handler.
//
// Its logic — including the platform_fee_ngn/school_amount_ngn
// tracking added in the subscription-billing-payment-enforcement lane
// — has been ported into the single canonical webhook at
// /api/webhooks/paystack, which IS public in middleware.ts and also
// handles subscription renewals and school registration. See
// docs/lane1-production-foundation/01-webhook-consolidation-followup.md.
//
// Kept as a stub rather than deleted, in case anything is still
// configured to POST here directly.
//
// TODO: once /api/webhooks/paystack is confirmed live end-to-end
// (Paystack dashboard Test/Live Webhook URL both pointed at it, one
// real payment verified per flow), delete this file and its route
// folder.

import { NextResponse } from 'next/server'
import crypto from 'crypto'

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY!

export async function POST(req: Request) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-paystack-signature')
  const expectedHash = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY).update(rawBody).digest('hex')

  if (signature !== expectedHash) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  console.warn(
    '[payments/paystack-webhook] Received a genuine Paystack event on the deprecated, ' +
    'previously-unreachable route. Update the Paystack Dashboard Webhook URL to /api/webhooks/paystack.'
  )

  return NextResponse.json({ received: true, deprecated: true })
}
