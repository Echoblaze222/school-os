// src/app/api/student-subscription/initialize/route.ts
//
// A parent (for their child) or a student (for themselves) starts paying the
// per-student term subscription. The charge is a plain Paystack transaction on
// YOUR Paystack account (PAYSTACK_SECRET_KEY): there is deliberately no
// `subaccount` and no split here, unlike school-fee payments, so the full
// amount settles to the platform owner.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { priceForStudent, STUDENT_REFERENCE_PREFIX } from '@/lib/studentBilling'

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://school-os-sphg.vercel.app'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: payer } = await supabase
      .from('profiles').select('id, role, email, full_name').eq('id', user.id).single()
    if (!payer || !['parent', 'student'].includes(payer.role)) {
      return NextResponse.json({ error: 'Only a parent or the student can pay this subscription' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const studentId: string | undefined = payer.role === 'student' ? user.id : body?.studentId
    if (!studentId) return NextResponse.json({ error: 'studentId is required' }, { status: 400 })

    const { data: student } = await admin
      .from('profiles')
      .select('id, role, school_id, parent_id, is_active, full_name')
      .eq('id', studentId).single()
    if (!student || student.role !== 'student' || !student.school_id) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }

    // Ownership: never trust studentId alone.
    if (payer.role === 'parent') {
      let owns = student.parent_id === user.id
      if (!owns) {
        const { data: link } = await admin
          .from('parent_student_links').select('student_id')
          .eq('parent_id', user.id).eq('student_id', studentId).maybeSingle()
        owns = !!link
      }
      if (!owns) return NextResponse.json({ error: 'This student is not linked to your account' }, { status: 403 })
    }

    if (!payer.email) return NextResponse.json({ error: 'No email on file for your account' }, { status: 400 })

    // Current term: the principal's dates if set, otherwise the default Nigerian
    // calendar (created on demand by the database). Null = school holiday gap.
    const { data: termJson } = await admin.rpc('current_term_json', { p_school: student.school_id })
    const term = termJson as { id: string; term_name: string; academic_year: string } | null
    if (!term) {
      return NextResponse.json({ error: 'It is currently the school holiday, so no subscription is due right now.' }, { status: 400 })
    }

    const { data: alreadyPaid } = await admin
      .from('student_subscriptions').select('id')
      .eq('student_id', studentId).eq('term_id', term.id).eq('status', 'paid').maybeSingle()
    if (alreadyPaid) return NextResponse.json({ error: 'This term is already paid for.' }, { status: 400 })

    // Price is derived server-side from the school's size, never from the client.
    const { count: schoolStudents } = await admin
      .from('profiles').select('id', { count: 'exact', head: true })
      .eq('school_id', student.school_id).eq('role', 'student').eq('is_active', true)
    const { amount, tierLabel } = priceForStudent(schoolStudents ?? 0)

    const reference = `${STUDENT_REFERENCE_PREFIX}${studentId.slice(0, 8).toUpperCase()}-${Date.now()}`

    // Pre-log BEFORE Paystack: activation cross-checks against this row.
    const { error: logErr } = await admin.from('student_subscriptions').insert({
      school_id: student.school_id,
      student_id: studentId,
      term_id: term.id,
      status: 'pending',
      amount_ngn: amount,
      rate_per_student: amount,
      tier_label: tierLabel,
      payer_id: user.id,
      paystack_reference: reference,
    })
    if (logErr) {
      console.error('[student-subscription/initialize] pre-log failed:', logErr)
      return NextResponse.json({ error: 'Could not start payment. Please try again.' }, { status: 500 })
    }

    // No `subaccount`, no `split`: the whole amount settles to your Paystack account.
    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: payer.email,
        amount: Math.round(amount * 100),
        reference,
        currency: 'NGN',
        callback_url: `${APP_URL}/api/student-subscription/callback`,
        metadata: {
          kind: 'student_subscription',
          student_id: studentId,
          school_id: student.school_id,
          term_id: term.id,
          payer_id: user.id,
          payer_role: payer.role,
        },
      }),
    })
    const data = await res.json()
    if (!data.status || !data.data?.authorization_url) {
      console.error('[student-subscription/initialize] Paystack error:', data)
      return NextResponse.json({ error: data.message ?? 'Failed to initialise payment' }, { status: 502 })
    }

    return NextResponse.json({ paymentUrl: data.data.authorization_url, reference })
  } catch (err) {
    console.error('[student-subscription/initialize] error:', err)
    return NextResponse.json({ error: 'Server error. Please try again.' }, { status: 500 })
  }
}
