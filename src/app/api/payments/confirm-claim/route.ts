// src/app/api/payments/confirm-claim/route.ts
//
// Called by bursar when they confirm a parent payment claim.
// Steps:
//  1. Mark claim as confirmed
//  2. Find the CORRECT invoice for this student/term/year (was: any school's
//     oldest unpaid invoice — a real bug that could deduct from the wrong
//     student's balance)
//  3. Insert into `payments` (same table RecordPaymentClient writes to, so
//     this flows through to Receipts/History/Reports/Export automatically)
//  4. Update payment_invoices.amount_paid_ngn + balance_ngn + status
//     (status now uses 'completed', matching the rest of the app's enum
//     usage — was incorrectly using 'paid')
//  5. Notify parent via notifications table

import { NextResponse }      from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient }      from '@/lib/supabase/server'

const TERM_KEY_MAP: Record<string, string> = {
  'First Term': 'first', 'Second Term': 'second', 'Third Term': 'third',
  first: 'first', second: 'second', third: 'third',
}

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
    invoice_id,   // may be null if parent didn't link a specific invoice
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

  // ── 2. Resolve invoice — scoped to THIS student + term + year ──
  // payment_invoices has no direct term/year columns; those live on the
  // linked fee_structures row. We join through that to filter correctly.
  let resolvedInvoiceId = invoice_id ?? null

  if (!resolvedInvoiceId) {
    const termKey = TERM_KEY_MAP[term] ?? term

    const { data: candidateInvoices } = await admin
      .from('payment_invoices')
      .select(`
        id, amount_due_ngn, amount_paid_ngn, balance_ngn, status,
        fee_structures ( term, academic_year )
      `)
      .eq('school_id', school_id)
      .eq('student_id', student_id)
      .neq('status', 'completed')
      .order('created_at', { ascending: true })

    // Filter client-side on the nested fee_structures term/year, since
    // PostgREST does not reliably apply filters on a 2nd-level embed.
    const match = (candidateInvoices ?? []).find((inv: any) => {
      const fs = inv.fee_structures
      return fs && fs.term === termKey && fs.academic_year === year
    })

    // Fall back to the oldest open invoice for this student if no exact
    // term/year match is found (e.g. claim predates fee structure setup),
    // but NEVER fall back across students or schools.
    resolvedInvoiceId = match?.id ?? (candidateInvoices?.[0]?.id ?? null)
  }

  // ── 3. Insert into payments table (matches your real schema) ───
  const receiptNumber = `RCP-${Date.now().toString(36).toUpperCase()}`

  const { data: pmtRow, error: pmtErr } = await admin.from('payments').insert({
    invoice_id:      resolvedInvoiceId,   // null if genuinely no invoice exists yet
    student_id,
    school_id,
    received_by:     bursar_id,
    amount_paid_ngn: Number(amount),
    currency_used:   'NGN',
    payment_method:  'bank_transfer',
    receipt_number:  receiptNumber,
    notes:           `Confirmed from parent payment claim (${fee_type?.replace(/_/g,' ')} — ${term} ${year})`,
    paid_at:         new Date().toISOString(),
  }).select('id').single()

  if (pmtErr) return NextResponse.json({ error: pmtErr.message }, { status: 500 })

  // ── 4. Update invoice balance ───────────────────────────────────
  if (resolvedInvoiceId) {
    const { data: inv } = await admin.from('payment_invoices')
      .select('amount_due_ngn, amount_paid_ngn, balance_ngn')
      .eq('id', resolvedInvoiceId).single()

    if (inv) {
      const newPaid    = (inv.amount_paid_ngn ?? 0) + Number(amount)
      const newBalance = Math.max(0, (inv.balance_ngn ?? inv.amount_due_ngn) - Number(amount))
      // 'completed' matches the enum value used everywhere else in the app
      // (RecordPaymentClient, InvoicesClient, generate-invoices route).
      // The previous version used 'paid', which doesn't exist in payment_status.
      const newStatus = newBalance <= 0 ? 'completed' : 'partial'

      await admin.from('payment_invoices').update({
        amount_paid_ngn: newPaid,
        balance_ngn:     newBalance,
        status:          newStatus,
        updated_at:      new Date().toISOString(),
      }).eq('id', resolvedInvoiceId)
    }
  }

  // ── 5. Notify parent ────────────────────────────────────────────
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

  return NextResponse.json({
    ok: true,
    receipt_number: receiptNumber,
    invoice_id: resolvedInvoiceId,
  })
}
