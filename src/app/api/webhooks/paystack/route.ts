// src/app/api/webhooks/paystack/route.ts
//
// THE canonical Paystack webhook — Paystack only delivers events to one
// configured URL per account (Dashboard → Settings → API Keys &
// Webhooks → Webhook URL), so every charge.success event, regardless of
// which flow initiated the payment, needs to arrive here and be routed
// internally. See docs/lane1-production-foundation/
// 01-webhook-consolidation-followup.md for the full history of why this
// consolidation exists — short version: three separate webhook route
// files existed at different paths, and Paystack can only ever be
// calling one of them, so the other two silently never ran.
//
// This version merges two independent hardening passes:
//   - Lane 1 (this file's original consolidation): one URL, routing by
//     payment type, plus a general-purpose idempotency-key layer
//     (src/lib/idempotency.ts) so a retried delivery never re-runs a
//     handler's side effects.
//   - Lane 2 (docs/lane2-subscription-billing-payment-enforcement):
//     found that the per-flow activation functions themselves trusted
//     client-echoed Paystack metadata with no check that a reference
//     actually came from the flow it claimed to — a parent's ₦100 fee
//     payment carried the same `metadata.school_id` a registration or
//     renewal payment did, and satisfied every check the old
//     activateSchool()/activateSubscription() made. The fix lives
//     inside those two functions now (imported below, unchanged): each
//     refuses any reference that doesn't start with the prefix its own
//     flow generates server-side (SCH-REG- / SCOS-), and
//     activateSubscription additionally requires a matching pre-logged
//     row in `subscription_payments` with a sufficient amount.
//
// Given that hardening, routing here is done by REFERENCE PREFIX, not
// metadata shape — prefix is what the activation functions themselves
// authoritatively check, so routing on the same signal keeps this file
// and those functions from being able to drift out of sync about what
// counts as "a registration payment":
//   SCH-REG-*  → school registration   (activateSchool)
//   SCOS-*     → subscription renewal  (activateSubscription)
//   anything else with metadata.invoice_id → fee/invoice payment (handled inline)

import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { withIdempotency } from '@/lib/idempotency'
import { logger, newTraceId } from '@/lib/logger'
import { logActivityWithClient } from '@/lib/logActivity'
import { activateSchool } from '@/lib/activateSchool'
import { activateSubscription } from '@/app/api/subscription/callback/route'

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY!

const REGISTRATION_REFERENCE_PREFIX = 'SCH-REG-'
const SUBSCRIPTION_REFERENCE_PREFIX = 'SCOS-'

function generateReceiptNumber(): string {
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `RCP-${stamp}-${rand}`
}

// ─── Invoice/fee payment ────────────────────────────────────────────────
// Kept inline (not its own lib function) because, unlike the other two
// flows, this one has no separate "callback" redirect path duplicating
// it elsewhere — the online-checkout flow does a full-page redirect to
// Paystack's hosted page with no client-side success moment, so this
// webhook is the only place that ever learns the charge succeeded.
// Ported as-is from the platform-fee-tracking version built in Lane 2
// (docs/lane2-subscription-billing-payment-enforcement) — the
// platform_fee_ngn/school_amount_ngn split computed at initialize time
// by computePlatformFee() (lib/billing.ts) is recorded here verbatim,
// not recomputed, so what's audited is exactly what was charged.
async function handleInvoicePayment(admin: ReturnType<typeof createAdminClient>, data: any, traceId: string) {
  const { reference, amount, metadata } = data
  const invoiceId = metadata?.invoice_id
  const studentId = metadata?.student_id
  const schoolId = metadata?.school_id

  if (!invoiceId || !studentId || !schoolId) {
    throw new Error('Missing invoice_id/student_id/school_id in metadata')
  }

  const amountNgn = amount / 100
  const platformFeeNgn = typeof metadata?.platform_fee_ngn === 'number' ? metadata.platform_fee_ngn : null
  const schoolAmountNgn = typeof metadata?.school_amount_ngn === 'number' ? metadata.school_amount_ngn : null

  const { data: invoice, error: invErr } = await admin
    .from('payment_invoices')
    .select('id, balance_ngn, amount_paid_ngn, amount_due_ngn')
    .eq('id', invoiceId)
    .single()
  if (invErr || !invoice) throw new Error('Invoice not found for webhook')

  const { error: payErr } = await admin
    .from('payments')
    .insert({
      invoice_id: invoiceId,
      student_id: studentId,
      received_by: null, // null = parent self-service via Paystack, not recorded by a bursar
      amount_paid_ngn: amountNgn,
      currency_used: 'NGN',
      receipt_number: generateReceiptNumber(),
      payment_method: 'paystack',
      payment_reference: reference,
      notes: 'Paid online via Paystack',
      paid_at: new Date().toISOString(),
      school_id: schoolId,
      platform_fee_ngn: platformFeeNgn,
      school_amount_ngn: schoolAmountNgn,
    })
  if (payErr) throw new Error(`Failed to insert payment: ${payErr.message}`)

  const newAmountPaid = (invoice.amount_paid_ngn ?? 0) + amountNgn
  const newBalance = Math.max(0, invoice.amount_due_ngn - newAmountPaid)
  const newStatus = newBalance <= 0 ? 'paid' : 'partial'

  const { error: updateErr } = await admin
    .from('payment_invoices')
    .update({ amount_paid_ngn: newAmountPaid, balance_ngn: newBalance, status: newStatus })
    .eq('id', invoiceId)
  if (updateErr) throw new Error(`Failed to update invoice: ${updateErr.message}`)

  const { data: studentProfile } = await admin
    .from('profiles')
    .select('parent_id, full_name')
    .eq('id', studentId)
    .single()

  if (studentProfile?.parent_id) {
    await admin.from('notifications').insert({
      user_id: studentProfile.parent_id,
      school_id: schoolId,
      type: 'payment',
      title: 'Payment Received',
      body: `Your payment of ₦${amountNgn.toLocaleString('en-NG')} for ${studentProfile.full_name} was successful.`,
      link_url: '/dashboard/parent/fees',
      is_read: false,
    })

    await logActivityWithClient(admin, {
      userId: studentProfile.parent_id, schoolId,
      type: 'fee_paid',
      title: `Paid ₦${amountNgn.toLocaleString('en-NG')} for ${studentProfile.full_name}`,
      subtitle: 'via Paystack',
      href: '/dashboard/parent/fees',
    })
  }

  const { data: staff } = await admin
    .from('profiles')
    .select('id, role')
    .eq('school_id', schoolId)
    .in('role', ['bursar', 'principal'])

  if (staff && staff.length > 0) {
    await admin.from('notifications').insert(
      staff.map((s: any) => ({
        user_id: s.id,
        school_id: schoolId,
        type: 'payment',
        title: 'Online Payment Received',
        body: `${studentProfile?.full_name ?? 'A student'} paid ₦${amountNgn.toLocaleString('en-NG')} via Paystack. Receipt generated automatically.`,
        link_url: s.role === 'bursar' ? '/dashboard/bursar/receipts' : '/dashboard/principal',
        is_read: false,
      }))
    )
  }

  logger.info('invoice payment webhook processed', { traceId, invoiceId, schoolId, amountNgn })
  return { handled: 'invoice_payment', invoiceId }
}

// ─── Subscription renewal ───────────────────────────────────────────────
// activateSubscription() does its own SCOS- prefix check and
// subscription_payments cross-check internally — this wrapper just
// surfaces its {activated, reason} result as a thrown error on refusal,
// so a blocked forgery attempt shows up as a webhook processing failure
// in logs/paystack_webhook_events rather than a silent 200.
async function handleSubscriptionRenewal(admin: ReturnType<typeof createAdminClient>, data: any, traceId: string) {
  const { reference, amount, metadata } = data
  const schoolId = metadata?.school_id
  if (!schoolId) throw new Error('Missing school_id in metadata for renewal')

  const result = await activateSubscription({
    adminSupabase: admin,
    school_id: schoolId,
    amount_ngn: amount / 100,
    reference,
    principal_id: metadata?.principal_id,
  })

  if (!result.activated) {
    throw new Error(`activateSubscription refused: ${result.reason}`)
  }

  logger.info('subscription renewal webhook processed', { traceId, schoolId })
  return { handled: 'subscription_renewal', schoolId }
}

// ─── School registration ────────────────────────────────────────────────
// Same pattern — activateSchool() does its own SCH-REG- prefix check.
async function handleSchoolRegistration(admin: ReturnType<typeof createAdminClient>, data: any, traceId: string) {
  const { reference, amount, metadata } = data
  const schoolId = metadata?.school_id
  // register/route.ts sends `payment_mode: 'full' | 'installment'` in
  // metadata - there is no more per-tier `plan` at registration time.
  const paymentMode = metadata?.payment_mode ?? 'full'
  if (!schoolId) throw new Error('Missing school_id in metadata for registration')

  const result = await activateSchool(schoolId, paymentMode, amount, reference)

  if (!result.activated) {
    throw new Error(`activateSchool refused: ${result.reason}`)
  }

  logger.info('school registration webhook processed', { traceId, schoolId, paymentMode })
  return { handled: 'school_registration', schoolId }
}

export async function POST(req: Request) {
  const traceId = newTraceId()
  const rawBody = await req.text()
  const signature = req.headers.get('x-paystack-signature') ?? ''

  const expectedHash = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY).update(rawBody).digest('hex')
  if (signature !== expectedHash) {
    logger.warn('paystack webhook invalid signature', { traceId })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event: any
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: logRow } = await admin
    .from('paystack_webhook_events')
    .insert({
      event_type: event.event,
      reference: event.data?.reference ?? null,
      payload: event,
    })
    .select('id')
    .single()

  if (event.event !== 'charge.success') {
    return NextResponse.json({ received: true })
  }

  const reference: string | undefined = event.data?.reference
  if (!reference) {
    return NextResponse.json({ received: true, error: 'No reference in event' })
  }

  const metadata = event.data?.metadata ?? {}
  let scope: string
  let handler: () => Promise<unknown>

  if (reference.startsWith(REGISTRATION_REFERENCE_PREFIX)) {
    scope = 'paystack_school_registration'
    handler = () => handleSchoolRegistration(admin, event.data, traceId)
  } else if (reference.startsWith(SUBSCRIPTION_REFERENCE_PREFIX)) {
    scope = 'paystack_subscription_renewal'
    handler = () => handleSubscriptionRenewal(admin, event.data, traceId)
  } else if (metadata.invoice_id) {
    scope = 'paystack_invoice_payment'
    handler = () => handleInvoicePayment(admin, event.data, traceId)
  } else {
    // Neither a recognized reference prefix nor invoice metadata — ack
    // without erroring rather than throwing, since an unrecognized
    // reference is expected to happen (e.g. a stray transaction on the
    // Paystack account unrelated to any of this app's flows), not a bug.
    logger.warn('paystack webhook: unrecognized reference/metadata shape', { traceId, reference })
    if (logRow?.id) {
      await admin.from('paystack_webhook_events').update({ error_message: 'Unrecognized payment type' }).eq('id', logRow.id)
    }
    return NextResponse.json({ received: true, error: 'Unrecognized payment type' })
  }

  try {
    // Outer idempotency layer, independent of each handler's own
    // internal checks (activateSubscription/activateSchool refuse
    // reprocessing via their own tables; the invoice path has no
    // built-in duplicate guard of its own). A Paystack retry of the
    // exact same event hits 'replay' here and skips straight to the
    // cached result without re-running the handler at all.
    const outcome = await withIdempotency(admin, scope, reference, handler)

    if (logRow?.id) {
      await admin.from('paystack_webhook_events').update({ processed: outcome.status !== 'unavailable' }).eq('id', logRow.id)
    }

    if (outcome.status === 'conflict') {
      return NextResponse.json({ received: true, retry: true }, { status: 409 })
    }
    if (outcome.status === 'unavailable') {
      return NextResponse.json({ received: true, retry: true }, { status: 503 })
    }

    return NextResponse.json({ received: true, ...outcome })
  } catch (err: any) {
    logger.error('paystack webhook handler failed', { traceId, scope, reference, error: err.message })
    if (logRow?.id) {
      await admin.from('paystack_webhook_events').update({ error_message: err.message }).eq('id', logRow.id)
    }
    // Return 200 anyway after logging — an error response makes
    // Paystack retry indefinitely, and the raw event is already logged
    // in paystack_webhook_events for manual reconciliation. This
    // includes refused forgery attempts (activateSchool/
    // activateSubscription returning activated: false) — those are
    // correctly-blocked, not a system failure, so no retry is wanted.
    return NextResponse.json({ received: true, error: err.message })
  }
}
