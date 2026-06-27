// src/app/api/payments/paystack-webhook/route.ts
//
// Paystack calls this URL after every transaction event. We only act on
// charge.success. Steps:
//   1. Verify the x-paystack-signature header (HMAC SHA512 of the raw body
//      using PAYSTACK_SECRET_KEY) — without this, anyone could POST a fake
//      "payment succeeded" event and mark invoices paid for free.
//   2. Log the raw event to paystack_webhook_events (debugging/audit trail).
//   3. Look up the invoice from metadata.invoice_id, insert a `payments` row,
//      and let the existing balance_ngn/status update follow the same
//      pattern bursar's RecordPaymentClient already uses.
//   4. Insert a `notifications` row so the parent sees an in-app confirmation.
//
// Configure this URL in your Paystack Dashboard → Settings → API Keys & Webhooks:
//   https://school-os-j4bn.vercel.app/api/payments/paystack-webhook

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY!

// Webhooks have no user session — use the service role key to bypass RLS,
// same pattern as the super-admin createUser flow.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function generateReceiptNumber(): string {
  const d     = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const rand  = Math.floor(1000 + Math.random() * 9000)
  return `RCP-${stamp}-${rand}`
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  // 1. Verify signature
  const signature = req.headers.get('x-paystack-signature')
  const expectedHash = crypto
    .createHmac('sha512', PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest('hex')

  if (signature !== expectedHash) {
    console.error('Paystack webhook: invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const event = JSON.parse(rawBody)

  // 2. Log every event for audit/debugging purposes
  const { data: logRow } = await supabaseAdmin
    .from('paystack_webhook_events')
    .insert({
      event_type: event.event,
      reference:  event.data?.reference ?? null,
      payload:    event,
    })
    .select('id')
    .single()

  if (event.event !== 'charge.success') {
    // Acknowledge but ignore — we only care about successful charges right now
    return NextResponse.json({ received: true })
  }

  try {
    const { reference, amount, metadata } = event.data
    const invoiceId = metadata?.invoice_id
    const studentId = metadata?.student_id
    const schoolId   = metadata?.school_id

    if (!invoiceId || !studentId || !schoolId) {
      throw new Error('Missing invoice_id/student_id/school_id in metadata')
    }

    // Idempotency: if a payment with this reference already exists, this is
    // a duplicate webhook delivery (Paystack retries on non-2xx or timeout).
    // Do nothing further — just acknowledge.
    const { data: existing } = await supabaseAdmin
      .from('payments')
      .select('id')
      .eq('payment_reference', reference)
      .maybeSingle()

    if (existing) {
      await supabaseAdmin
        .from('paystack_webhook_events')
        .update({ processed: true })
        .eq('id', logRow?.id)
      return NextResponse.json({ received: true, duplicate: true })
    }

    const amountNgn = amount / 100 // Paystack sends kobo

    const { data: invoice, error: invErr } = await supabaseAdmin
      .from('payment_invoices')
      .select('id, balance_ngn, amount_paid_ngn, amount_due_ngn')
      .eq('id', invoiceId)
      .single()

    if (invErr || !invoice) throw new Error('Invoice not found for webhook')

    // Insert the payment row — same shape RecordPaymentClient.tsx uses
    const { data: payment, error: payErr } = await supabaseAdmin
      .from('payments')
      .insert({
        invoice_id:        invoiceId,
        student_id:        studentId,
        received_by:       null, // null = parent self-service via Paystack, not recorded by a bursar
        amount_paid_ngn:   amountNgn,
        currency_used:     'NGN',
        receipt_number:    generateReceiptNumber(),
        payment_method:    'paystack',
        payment_reference: reference,
        notes:             'Paid online via Paystack',
        paid_at:           new Date().toISOString(),
        school_id:         schoolId,
      })
      .select('id')
      .single()

    if (payErr) throw new Error(`Failed to insert payment: ${payErr.message}`)

    // Update the invoice balance/status
    const newAmountPaid = (invoice.amount_paid_ngn ?? 0) + amountNgn
    const newBalance    = Math.max(0, invoice.amount_due_ngn - newAmountPaid)
    const newStatus     = newBalance <= 0 ? 'paid' : 'partial'

    const { error: updateErr } = await supabaseAdmin
      .from('payment_invoices')
      .update({
        amount_paid_ngn: newAmountPaid,
        balance_ngn:     newBalance,
        status:          newStatus,
      })
      .eq('id', invoiceId)

    if (updateErr) throw new Error(`Failed to update invoice: ${updateErr.message}`)

    // Notify the parent in-app
    const { data: studentProfile } = await supabaseAdmin
      .from('profiles')
      .select('parent_id, full_name')
      .eq('id', studentId)
      .single()

    if (studentProfile?.parent_id) {
      await supabaseAdmin.from('notifications').insert({
        user_id:    studentProfile.parent_id,
        school_id:  schoolId,
        type:       'payment',
        title:      'Payment Received',
        body:       `Your payment of ₦${amountNgn.toLocaleString('en-NG')} for ${studentProfile.full_name} was successful.`,
        link_url:   '/dashboard/parent/fees',
        is_read:    false,
      })
    }

    // Notify bursars and the principal at this school — they don't review
    // Paystack payments (Paystack already verified the charge), but they
    // should still know money has landed without having to keep checking
    // the Receipts list manually.
    const { data: staff } = await supabaseAdmin
      .from('profiles')
      .select('id, role')
      .eq('school_id', schoolId)
      .in('role', ['bursar', 'principal'])

    if (staff && staff.length > 0) {
      await supabaseAdmin.from('notifications').insert(
        staff.map(s => ({
          user_id:   s.id,
          school_id: schoolId,
          type:      'payment',
          title:     'Online Payment Received',
          body:      `${studentProfile?.full_name ?? 'A student'} paid ₦${amountNgn.toLocaleString('en-NG')} via Paystack. Receipt generated automatically.`,
          link_url:  s.role === 'bursar' ? '/dashboard/bursar/receipts' : '/dashboard/principal',
          is_read:   false,
        }))
      )
    }

    await supabaseAdmin
      .from('paystack_webhook_events')
      .update({ processed: true })
      .eq('id', logRow?.id)

    return NextResponse.json({ received: true })
  } catch (err: any) {
    console.error('Paystack webhook processing error:', err)
    await supabaseAdmin
      .from('paystack_webhook_events')
      .update({ error_message: err.message })
      .eq('id', logRow?.id)

    // Return 200 anyway after logging — returning an error causes Paystack
    // to retry indefinitely, and since we've logged the raw event, you can
    // always reconcile manually rather than getting hammered with retries.
    return NextResponse.json({ received: true, error: err.message })
  }
}
  
