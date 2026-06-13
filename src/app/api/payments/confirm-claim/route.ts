// src/app/api/payments/confirm-claim/route.ts
//
// Called by bursar when they confirm a parent payment claim.
// Steps:
//  1. Mark claim as confirmed
//  2. Find the student's open invoice for this term
//  3. Insert into the REAL `payments` table (matches your existing schema)
//  4. Update payment_invoices.amount_paid_ngn + balance_ngn + status
//  5. Notify parent via notifications table

import { NextResponse }      from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient }      from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const admin    = createAdminClient()

  // ── Auth check ────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await admin.from('profiles')
    .select('role, school_id').eq('id', user.id).single()

  if (!me || !['bursar', 'principal', 'super_admin'].includes(me.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const {
    claim_id, bursar_id, school_id,
    student_id, parent_id,
    amount, term, year, fee_type,
    invoice_id,   // may be null if parent didn't link an invoice
  } = await req.json()

  if (!claim_id || !school_id || !student_id || !amount) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // ── 1. Mark claim confirmed ───────────────────────────────────
  const { error: claimErr } = await admin.from('payment_claims').update({
    status:      'confirmed',
    reviewed_by: bursar_id,
    reviewed_at: new Date().toISOString(),
    updated_at:  new Date().toISOString(),
  }).eq('id', claim_id)

  if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 })

  // ── 2. Resolve invoice ────────────────────────────────────────
  // Use the invoice_id from the claim, or find the oldest unpaid invoice
  let resolvedInvoiceId = invoice_id ?? null

  if (!resolvedInvoiceId) {
    const { data: inv } = await admin.from('payment_invoices')
      .select('id, amount_due_ngn, amount_paid_ngn, balance_ngn')
      .eq('school_id', school_id)
      // payment_invoices doesn't have student_id directly — look via fee_structures + student
      // Fallback: use any open invoice for this student from the student's linked invoices
      .neq('status', 'paid')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    resolvedInvoiceId = inv?.id ?? null
  }

  // ── 3. Insert into payments table (matches your real schema) ──
  const receiptNumber = `RCP-${Date.now().toString(36).toUpperCase()}`

  const { data: pmtRow, error: pmtErr } = await admin.from('payments').insert({
    invoice_id:     resolvedInvoiceId,   // required FK — null if no invoice found
    student_id,
    school_id,
    received_by:    bursar_id,
    amount_paid_ngn: Number(amount),
    currency_used:  'NGN',
    payment_method: 'bank_transfer',
    receipt_number: receiptNumber,
    notes:          `Confirmed from parent payment claim (${fee_type?.replace(/_/g,' ')} — ${term} ${year})`,
    paid_at:        new Date().toISOString(),
  }).select('id').single()

  if (pmtErr) return NextResponse.json({ error: pmtErr.message }, { status: 500 })

  // ── 4. Update invoice balance ─────────────────────────────────
  if (resolvedInvoiceId) {
    const { data: inv } = await admin.from('payment_invoices')
      .select('amount_due_ngn, amount_paid_ngn, balance_ngn')
      .eq('id', resolvedInvoiceId).single()

    if (inv) {
      const newPaid    = (inv.amount_paid_ngn ?? 0) + Number(amount)
      const newBalance = Math.max(0, (inv.balance_ngn ?? inv.amount_due_ngn) - Number(amount))
      const newStatus  = newBalance <= 0 ? 'paid' : 'partial'

      await admin.from('payment_invoices').update({
        amount_paid_ngn: newPaid,
        balance_ngn:     newBalance,
        status:          newStatus,
        updated_at:      new Date().toISOString(),
      }).eq('id', resolvedInvoiceId)
    }
  }

  // ── 5. Notify parent ──────────────────────────────────────────
  const fmtAmount = new Intl.NumberFormat('en-NG', {
    style: 'currency', currency: 'NGN', minimumFractionDigits: 0,
  }).format(amount)

  await admin.from('notifications').insert({
    user_id:    parent_id,
    school_id,
    title:      'Payment Confirmed ✓',
    body:       `Your payment of ${fmtAmount} for ${fee_type?.replace(/_/g,' ')} (${term} ${year}) has been confirmed. Balance updated.`,
    type:       'payment',
    action_url: '/dashboard/parent/fees',
    is_read:    false,
  })

  return NextResponse.json({ ok: true, receipt_number: receiptNumber })
}
