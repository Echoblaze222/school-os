// src/app/api/examination/quizzes/[quizId]/start/route.ts
// -------------------------------------------------------
// Starts (or resumes) a CBT attempt. This is the route that replaces
// the old client-side flow where QuizTakeClient queried quiz_questions
// directly and got `answer`/`correct_option` back in the payload,
// scored itself, and ran its own setInterval countdown — all of which
// a student could edit in devtools. From here on:
//
//   - the browser NEVER receives `answer` / `correct_option`
//   - the timer is `expires_at`, computed here, server clock only
//   - the question/option order is frozen once and reused on resume
//   - eligibility (school, class, window, already-completed) is
//     re-checked here even though the UI also hides ineligible quizzes
// -------------------------------------------------------

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rateLimit'
import {
  checkStartEligibility, buildFrozenPaper, sanitizeQuestionsForClient,
  finalizeIfExpired, type DbQuizRow, type RawQuestion,
} from '@/lib/cbt/attempt'

export async function POST(_req: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated.' }, { status: 401 })

  const rl = await checkRateLimit(admin, 'cbt_start', user.id, 30, 300)
  if (!rl.allowed) return NextResponse.json({ ok: false, error: rl.errorResponse!.error }, { status: rl.errorResponse!.status })

  const { data: profile } = await admin.from('profiles').select('role, school_id, class_id').eq('id', user.id).single()
  if (!profile || profile.role !== 'student') {
    return NextResponse.json({ ok: false, error: 'Only students can take this quiz.' }, { status: 403 })
  }

  const { data: quiz } = await admin
    .from('quizzes')
    .select('id, school_id, class_id, teacher_id, mode, status, duration_mins, attempt_limit, starts_at, ends_at, scheduled_at, closes_at, randomize_questions, randomize_options, allow_resume, pass_mark')
    .eq('id', quizId)
    .maybeSingle()

  const { data: existingAttempt } = await admin
    .from('quiz_attempts')
    .select('id, status, expires_at, answers, question_order, score, max_score, percentage, passed')
    .eq('quiz_id', quizId)
    .eq('student_id', user.id)
    .maybeSingle()

  // Lazily close out anything that expired while nobody was looking.
  if (existingAttempt) {
    await finalizeIfExpired(admin, {
      id: existingAttempt.id, quiz_id: quizId, status: existingAttempt.status,
      expires_at: existingAttempt.expires_at, answers: existingAttempt.answers ?? {},
    })
  }
  const { data: freshAttempt } = existingAttempt
    ? await admin.from('quiz_attempts').select('id, status, expires_at, answers, question_order, score, max_score, percentage, passed')
        .eq('id', existingAttempt.id).single()
    : { data: null }

  const eligibility = checkStartEligibility({
    quiz: quiz as DbQuizRow | null,
    studentSchoolId: profile.school_id,
    studentClassId: profile.class_id,
    now: new Date(),
    priorAttempt: freshAttempt ? { status: freshAttempt.status } : null,
  })
  if (!eligibility.eligible) {
    return NextResponse.json({ ok: false, error: eligibility.reason }, { status: eligibility.status ?? 403 })
  }

  const { data: questionRows } = await admin
    .from('quiz_questions')
    .select('id, text, question, options, answer, correct_option, marks, position')
    .eq('quiz_id', quizId)
    .order('position', { ascending: true })
  const questions = (questionRows ?? []) as RawQuestion[]

  if (questions.length === 0) {
    return NextResponse.json({ ok: true, quiz, questions: [], attempt: null, serverNow: new Date().toISOString() })
  }

  // ── Resume: reuse the frozen paper and existing timer, never regenerate ──
  if (freshAttempt && freshAttempt.status === 'in_progress') {
    const paper = freshAttempt.question_order as { questionOrder: string[]; optionOrder: Record<string, string[]> }
    return NextResponse.json({
      ok: true,
      quiz,
      questions: sanitizeQuestionsForClient(questions, paper),
      attempt: {
        id: freshAttempt.id, status: freshAttempt.status,
        expiresAt: freshAttempt.expires_at, answers: freshAttempt.answers ?? {},
      },
      serverNow: new Date().toISOString(),
    })
  }

  // ── Already finished (belt-and-suspenders — eligibility already caught this) ──
  if (freshAttempt && ['submitted', 'auto_submitted'].includes(freshAttempt.status)) {
    return NextResponse.json({
      ok: true, quiz, questions: [], alreadyDone: true,
      attempt: { id: freshAttempt.id, status: freshAttempt.status, score: freshAttempt.score, maxScore: freshAttempt.max_score, percentage: freshAttempt.percentage, passed: freshAttempt.passed },
      serverNow: new Date().toISOString(),
    })
  }

  // ── Fresh start ──────────────────────────────────────────────────────
  const durationMins = (quiz as DbQuizRow).duration_mins ?? 30
  const now = new Date()
  const expiresAt = new Date(now.getTime() + durationMins * 60_000)
  const paper = buildFrozenPaper(questions, (quiz as DbQuizRow).randomize_questions, (quiz as DbQuizRow).randomize_options)

  const { data: inserted, error: insertErr } = await admin
    .from('quiz_attempts')
    .insert({
      quiz_id: quizId, student_id: user.id, school_id: profile.school_id,
      status: 'in_progress', started_at: now.toISOString(), expires_at: expiresAt.toISOString(),
      last_activity_at: now.toISOString(), question_order: paper, answers: {}, completed: false,
    })
    .select('id, status, expires_at, answers')
    .single()

  if (insertErr) {
    // Unique-violation race: another request already created the row
    // (double-tap on "Start"). Re-fetch and treat as resume rather than
    // erroring — the student should never see "failed to start" for
    // something that actually succeeded a moment earlier.
    const { data: raced } = await admin
      .from('quiz_attempts')
      .select('id, status, expires_at, answers, question_order')
      .eq('quiz_id', quizId).eq('student_id', user.id).single()
    if (raced?.question_order) {
      return NextResponse.json({
        ok: true, quiz,
        questions: sanitizeQuestionsForClient(questions, raced.question_order as any),
        attempt: { id: raced.id, status: raced.status, expiresAt: raced.expires_at, answers: raced.answers ?? {} },
        serverNow: new Date().toISOString(),
      })
    }
    return NextResponse.json({ ok: false, error: `Could not start the quiz: ${insertErr.message}` }, { status: 500 })
  }

  return NextResponse.json({
    ok: true, quiz,
    questions: sanitizeQuestionsForClient(questions, paper),
    attempt: { id: inserted.id, status: inserted.status, expiresAt: inserted.expires_at, answers: {} },
    serverNow: now.toISOString(),
  })
}
