// src/lib/logActivity.ts
'use client'
import { createClient } from '@/lib/supabase/client'

export interface LogActivityInput {
  userId: string
  schoolId: string
  type: string        // 'assignment_submitted' | 'result_viewed' | 'quiz_completed' | ...
  title: string
  subtitle?: string
  href: string
  metadata?: Record<string, any>
}

/**
 * Fire-and-forget activity logger. Call this right after a meaningful
 * user action completes successfully (e.g. after a Supabase insert/update
 * for the actual action succeeds). Never blocks or throws into the caller - * a failed activity log should never break the user's actual task.
 *
 * Example:
 *   await supabase.from('assignment_submissions').insert({...})
 *   logActivity({
 *     userId, schoolId,
 *     type: 'assignment_submitted',
 *     title: `Submitted "${assignment.title}"`,
 *     subtitle: assignment.subject,
 *     href: `/dashboard/student/assignments/${assignment.id}`,
 *   })
 */
export async function logActivity(input: LogActivityInput) {
  try {
    const supabase = createClient()
    await supabase.from('recent_activities').insert({
      user_id:    input.userId,
      school_id:  input.schoolId,
      type:       input.type,
      title:      input.title,
      subtitle:   input.subtitle ?? null,
      href:       input.href,
      metadata:   input.metadata ?? null,
    })
  } catch (err) {
    // Swallow errors - activity logging is a nice-to-have, never critical path
    console.warn('logActivity failed (non-critical):', err)
  }
}

/**
 * Server-side variant for API routes and webhooks, which have no browser
 * session for the client-side createClient() to attach to. Pass in
 * whichever Supabase client the caller already has - typically the
 * service-role admin client, since webhooks (e.g. the Paystack webhook)
 * act on behalf of the system rather than an authenticated browser user.
 *
 * Example (inside a webhook route.ts):
 *   await logActivityWithClient(supabaseAdmin, {
 *     userId: parentId, schoolId,
 *     type: 'fee_paid',
 *     title: `Paid ₦${amount.toLocaleString()} for ${studentName}`,
 *     href: '/dashboard/parent/fees',
 *   })
 */
export async function logActivityWithClient(supabase: any, input: LogActivityInput) {
  try {
    await supabase.from('recent_activities').insert({
      user_id:    input.userId,
      school_id:  input.schoolId,
      type:       input.type,
      title:      input.title,
      subtitle:   input.subtitle ?? null,
      href:       input.href,
      metadata:   input.metadata ?? null,
    })
  } catch (err) {
    console.warn('logActivityWithClient failed (non-critical):', err)
  }
}
