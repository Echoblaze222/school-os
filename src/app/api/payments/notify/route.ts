// src/app/api/payments/notify/route.ts
// Called by RecordPaymentClient after a successful cash payment insert.
// Inserts a notification row for every principal and bursar in the school.
import { NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  // 1. Auth check — must be a logged-in bursar (or any school staff)
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { payment_id } = await req.json()
  if (!payment_id) {
    return NextResponse.json({ error: 'payment_id is required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // 2. Fetch the payment row — join to student name and invoice description
  const { data: payment, error: pmtErr } = await admin
    .from('payments')
    .select(`
      id,
      amount_ngn,
      payment_method,
      receipt_number,
      school_id,
      student_profiles ( full_name ),
      payment_invoices ( description )
    `)
    .eq('id', payment_id)
    .single()

  if (pmtErr || !payment) {
    return NextResponse.json({ error: pmtErr?.message ?? 'Payment not found' }, { status: 404 })
  }

  const schoolId      = payment.school_id
  const studentName   = (payment.student_profiles as any)?.full_name  ?? 'A student'
  const invoiceDesc   = (payment.payment_invoices  as any)?.description ?? 'an invoice'
  const amountFmt     = new Intl.NumberFormat('en-NG', {
    style: 'currency', currency: 'NGN', maximumFractionDigits: 0,
  }).format(payment.amount_ngn)

  const title  = 'Payment Received'
  const body   = `${studentName} paid ${amountFmt} (${payment.payment_method}) for ${invoiceDesc}. Receipt: ${payment.receipt_number}`
  const actionUrl = '/dashboard/bursar/payments'

  // 3. Find all principal + bursar profiles for this school
  const { data: staff, error: staffErr } = await admin
    .from('profiles')
    .select('id')
    .eq('school_id', schoolId)
    .in('role', ['principal', 'bursar'])

  if (staffErr || !staff?.length) {
    // Nothing to notify — still return 200 so the client doesn't surface an error
    return NextResponse.json({ ok: true, notified: 0 })
  }

  // 4. Bulk-insert one notification per staff member
  const rows = staff.map((s: { id: string }) => ({
    user_id:    s.id,
    title,
    body,
    type:       'payment',
    action_url: actionUrl,
    is_read:    false,
  }))

  const { error: insertErr } = await admin.from('notifications').insert(rows)
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, notified: rows.length })
}