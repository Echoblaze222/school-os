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
 * for the actual action succeeds). Never blocks or throws into the caller —
 * a failed activity log should never break the user's actual task.
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
    // Swallow errors — activity logging is a nice-to-have, never critical path
    console.warn('logActivity failed (non-critical):', err)
  }
}
