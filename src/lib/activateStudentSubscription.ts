// src/lib/activateStudentSubscription.ts
//
// Marks ONE student's subscription paid for a term. Shared by the browser
// callback and the Paystack webhook, so it must be idempotent and must refuse
// anything that did not originate from the per-student flow.
//
// Same safety model as the old school-level activation: the reference must
// carry our prefix AND match a pending row we wrote server-side BEFORE sending
// the payer to Paystack. That row, not echoed metadata, is the source of truth.

import { STUDENT_REFERENCE_PREFIX } from '@/lib/studentBilling'

const AMOUNT_TOLERANCE_NGN = 1

export interface ActivateStudentSubscriptionResult {
  activated: boolean
  studentId?: string
  reason?: string
}

export async function activateStudentSubscription(
  admin: any,
  reference: string,
  paidAmountNgn: number,
): Promise<ActivateStudentSubscriptionResult> {
  if (!reference || !reference.startsWith(STUDENT_REFERENCE_PREFIX)) {
    return { activated: false, reason: 'reference_not_from_student_flow' }
  }

  const { data: row } = await admin
    .from('student_subscriptions')
    .select('id, school_id, student_id, term_id, status, amount_ngn, payer_id')
    .eq('paystack_reference', reference)
    .maybeSingle()

  if (!row) return { activated: false, reason: 'no_matching_pending_payment' }
  if (row.status === 'paid') return { activated: true, studentId: row.student_id } // idempotent replay
  if (paidAmountNgn < Number(row.amount_ngn) - AMOUNT_TOLERANCE_NGN) {
    return { activated: false, reason: 'amount_below_expected' }
  }

  const { error } = await admin
    .from('student_subscriptions')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('status', 'pending')

  if (error) {
    // Unique "one paid row per student per term" index hit: another attempt
    // already paid. Treat as success for the student; flag for refund review.
    if ((error as any).code === '23505') {
      console.warn(`[activateStudentSubscription] duplicate payment for student ${row.student_id}, ref ${reference} - needs refund review`)
      return { activated: true, studentId: row.student_id, reason: 'duplicate_payment_needs_refund_review' }
    }
    return { activated: false, reason: `update_failed:${error.message}` }
  }

  const { data: student } = await admin.from('profiles').select('full_name, parent_id').eq('id', row.student_id).single()
  const notify = [row.student_id, student?.parent_id].filter(Boolean) as string[]
  if (notify.length) {
    await admin.from('notifications').insert(
      Array.from(new Set(notify)).map(uid => ({
        user_id: uid,
        school_id: row.school_id,
        type: 'payment',
        title: 'Subscription active',
        body: `${student?.full_name ?? 'Your'} SchoolOS subscription for this term is active.`,
        is_read: false,
      })),
    )
  }

  return { activated: true, studentId: row.student_id }
}
