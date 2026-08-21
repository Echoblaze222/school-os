// src/app/api/schools/paystack-webhook/route.ts
//
// DEPRECATED — consolidated into the single canonical webhook at
// /api/webhooks/paystack, which handles school registration (via the
// same hardened activateSchool()), plus subscription renewals and
// invoice payments, all behind one URL — since Paystack only delivers
// events to one configured Webhook URL per account anyway, having a
// second live implementation here meant it could silently drift out of
// sync with the real one. See
// docs/lane1-production-foundation/01-webhook-consolidation-followup.md.
//
// Kept as a stub (not deleted) in case anything external is still
// configured to POST here — it stays signature-verified and safe to
// hit, it just doesn't process anything, so nothing double-fires
// against the canonical route.
//
// TODO: once the Paystack dashboard's Test/Live Webhook URL is
// confirmed pointed at /api/webhooks/paystack and a real payment has
// been verified end-to-end, this file and its route folder can be
// deleted entirely, and this path removed from PUBLIC_PATHS in
// src/middleware.ts.

import { NextResponse } from 'next/server'
import { createHmac } from 'crypto'

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-paystack-signature') ?? ''

  const hash = createHmac('sha512', process.env.PAYSTACK_SECRET_KEY!)
    .update(rawBody)
    .digest('hex')

  if (hash !== signature) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  console.warn(
    '[schools/paystack-webhook] Received a genuine Paystack event on the deprecated route. ' +
    'Update the Paystack Dashboard Webhook URL to /api/webhooks/paystack.'
  )

  return NextResponse.json({ ok: true, deprecated: true })
}
