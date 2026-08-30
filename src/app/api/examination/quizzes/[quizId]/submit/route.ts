// src/app/api/examination/quizzes/[quizId]/submit/route.ts
// -------------------------------------------------------
// Final submission. Grading happens ONLY here, ONLY from the
// authoritative `answer` column read server-side — the request body
// carries no score, no percentage, no pass/fail, because none of that
// is trusted from the client per §14/§15 of the CBT spec.
//
// Double-submit / repeated-tap protection uses the existing
// idempotency_keys table (same mechanism already used elsewhere in the
// app) keyed by attempt id, so a flaky connection retry or a student
// mashing "Submit" can never grade the same attempt twice or return
// inconsistent results.
// -------------------------------------------------------

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rateLimit'
import { finalizeIfExpired, gradeAndFinalize } from '@/lib/cbt/attempt'
import { logActivityWithClient } from '@/lib/logActivity'

export async function POST(_req: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated.' }, { status: 401 })

  const rl = await checkRateLimit(admin, 'cbt_submit', user.id, 20, 300)
  if (!rl.allowed) return NextResponse.json({ ok: false, error: rl.errorResponse!.error }, { status: rl.errorResponse!.status })

  const { data: attempt } = await admin
    .from('quiz_attempts')
    .select('id, status, expires_at, answers, score, max_score, percentage, passed')
    .eq('quiz_id', quizId).eq('student_id', user.id).maybeSingle()

  if (!attempt) return NextResponse.json({ ok: false, error: 'No active attempt found.' }, { status: 404 })

  // Already finished — return the existing result instead of erroring,
  // so a retry after a network blip is a no-op, not a confusing failure.
  if (attempt.status !== 'in_progress') {
    await finalizeIfExpired(admin, { id: attempt.id, quiz_id: quizId, status: attempt.status, expires_at: attempt.expires_at, answers: attempt.answers ?? {} })
    return NextResponse.json({
      ok: true, alreadySubmitted: true,
      result: { score: attempt.score, maxScore: attempt.max_score, percentage: attempt.percentage, passed: attempt.passed },
    })
  }

  const idKey = `quiz_submit:${attempt.id}`
  const { data: idRow, error: idErr } = await admin
    .from('idempotency_keys')
    .insert({ scope: 'quiz_submit', key: idKey, status: 'in_progress' })
    .select('id')
    .single()

  if (idErr) {
    // Row already exists → a submit is/was already in flight for this attempt.
    // Re-read the attempt; whoever got there first already graded it.
    const { data: current } = await admin.from('quiz_attempts')
      .select('status, score, max_score, percentage, passed')
      .eq('id', attempt.id).single()
    if (current && current.status !== 'in_progress') {
      return NextResponse.json({
        ok: true, alreadySubmitted: true,
        result: { score: current.score, maxScore: current.max_score, percentage: current.percentage, passed: current.passed },
      })
    }
    return NextResponse.json({ ok: false, error: 'Your submission is already being processed.' }, { status: 409 })
  }

  try {
    const result = await gradeAndFinalize(admin, { id: attempt.id, quiz_id: quizId, answers: attempt.answers ?? {} }, { autoSubmitted: false })

    await admin.from('idempotency_keys').update({ status: 'completed', response: result as any, completed_at: new Date().toISOString() }).eq('id', idRow.id)

    const { data: quiz } = await admin.from('quizzes').select('title, school_id').eq('id', quizId).single()
    if (quiz?.school_id) {
      logActivityWithClient(admin, {
        userId: user.id, schoolId: quiz.school_id, type: 'quiz_completed',
        title: `Completed "${quiz.title ?? 'a quiz'}"`,
        subtitle: `${result.totalAwarded}/${result.totalPossible}`,
        href: '/dashboard/student/quizzes',
      }).catch(() => {}) // best-effort, never blocks the response the student is waiting on
    }

    return NextResponse.json({
      ok: true,
      result: { score: result.totalAwarded, maxScore: result.totalPossible, percentage: result.percentage, passed: result.passed, answeredCount: result.answeredCount },
    })
  } catch (err: any) {
    await admin.from('idempotency_keys').update({ status: 'failed' }).eq('id', idRow.id)
    return NextResponse.json({ ok: false, error: `Submission failed: ${err.message}. Your answers are still saved — try submitting again.` }, { status: 500 })
  }
}
