// src/app/api/student/quizzes/[id]/route.ts
//
// Server-side quiz flow. The browser never receives the answer key and never
// decides its own score.
//
//   POST { action: 'start' }                -> checks eligibility and the open window, opens (or
//                                              resumes) an attempt, returns questions WITHOUT answers
//                                              and the seconds left on the server's clock
//   POST { action: 'submit', answers: {} }  -> grades on the server, enforces the deadline, records
//                                              the attempt and closes it
//
// Rules enforced here: caller is a student of this school, the quiz is for
// their current class, it is open (starts_at..ends_at), they have attempts
// left (attempt_limit), and the attempt is submitted before
// min(start + duration, ends_at) + 2 minutes of grace.
//
// Needs sql/migrations/2026-10-27-quiz-sessions.sql.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  SUBMIT_GRACE_MS,
  attemptDeadlineMs,
  gradeAnswers,
  normalizeAttemptLimit,
  secondsLeft,
} from '@/lib/quizGrading'

type Admin = ReturnType<typeof createAdminClient>
type Ctx = { params: Promise<{ id: string }> }

const MIGRATION_HINT =
  'Quizzes are being upgraded. Ask the school to run sql/migrations/2026-10-27-quiz-sessions.sql, then try again.'

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status })
const bad = (error: string, status = 400, extra: Record<string, unknown> = {}) => json({ error, ...extra }, status)

function fail(err: { message?: string } | null | undefined) {
  const m = (err?.message ?? '').toLowerCase()
  if (m.includes('does not exist') || m.includes('could not find') || m.includes('schema cache')) {
    return json({ error: MIGRATION_HINT, code: 'migration_required' }, 503)
  }
  console.error('student quiz route error:', err?.message)
  return bad('Something went wrong. Please try again.', 500)
}

async function getStudent() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: bad('Unauthorized', 401) }
  const { data: profile } = await supabase.from('profiles').select('role, school_id, class_id').eq('id', user.id).single()
  const role = (profile as any)?.role
  const schoolId = (profile as any)?.school_id as string | undefined
  if (role !== 'student' || !schoolId) return { error: bad('Forbidden', 403) }

  // student_profiles.class_id is the CURRENT class (promotion updates it);
  // profiles.class_id can be stale, so it is only a fallback.
  const { data: sp } = await supabase.from('student_profiles').select('class_id').eq('id', user.id).maybeSingle()
  const classId = ((sp as any)?.class_id ?? (profile as any)?.class_id ?? null) as string | null
  return { userId: user.id, schoolId, classId }
}

async function lastAttempt(admin: Admin, quizId: string, studentId: string) {
  const { data } = await admin
    .from('quiz_attempts').select('score, max_score')
    .eq('quiz_id', quizId).eq('student_id', studentId)
    .order('submitted_at', { ascending: false }).limit(1)
  const a = (data ?? [])[0] as any
  return a ? { score: a.score ?? 0, max: a.max_score ?? 0 } : null
}

async function openSession(admin: Admin, quizId: string, studentId: string) {
  const { data, error } = await admin
    .from('quiz_sessions').select('id, started_at')
    .eq('quiz_id', quizId).eq('student_id', studentId).is('submitted_at', null)
    .order('started_at', { ascending: false }).limit(1)
  if (error) return { error }
  return { session: ((data ?? [])[0] as { id: string; started_at: string } | undefined) ?? null }
}

export async function POST(req: Request, ctx: Ctx) {
  const { id: quizId } = await ctx.params
  const student = await getStudent()
  if ('error' in student) return student.error

  let body: any
  try { body = await req.json() } catch { return bad('Invalid JSON') }
  if (body?.action !== 'start' && body?.action !== 'submit') return bad('Unknown action')

  const admin = createAdminClient()

  const { data: quiz, error: qErr } = await admin.from('quizzes').select('*').eq('id', quizId).maybeSingle()
  if (qErr) return fail(qErr)
  // Same answer for "doesn't exist" and "not yours", so ids can't be probed.
  if (!quiz || (quiz as any).school_id !== student.schoolId || !student.classId || (quiz as any).class_id !== student.classId) {
    return bad('Quiz not found', 404)
  }
  const q = quiz as any
  const now = Date.now()

  // ── submit ──
  if (body.action === 'submit') {
    const cur = await openSession(admin, quizId, student.userId)
    if ('error' in cur) return fail(cur.error)
    if (!cur.session) return bad('No active attempt. Start the quiz again.', 409)

    const deadline = attemptDeadlineMs({ startedAt: cur.session.started_at, durationMins: q.duration_mins, endsAt: q.ends_at })
    if (now > deadline + SUBMIT_GRACE_MS) {
      await admin.from('quiz_sessions').update({ submitted_at: new Date().toISOString() }).eq('id', cur.session.id)
      return bad('Time ran out before your answers were submitted.', 409)
    }

    const { data: questions, error: qsErr } = await admin
      .from('quiz_questions').select('id, answer, marks').eq('quiz_id', quizId)
    if (qsErr) return fail(qsErr)

    const graded = gradeAnswers((questions ?? []) as any[], body?.answers)

    const { error: insErr } = await admin.from('quiz_attempts').insert({
      quiz_id: quizId,
      student_id: student.userId,
      school_id: student.schoolId,
      answers: graded.cleaned,
      score: graded.score,
      max_score: graded.max,
      submitted_at: new Date().toISOString(),
    })
    if (insErr) return fail(insErr)

    const { error: closeErr } = await admin.from('quiz_sessions')
      .update({ submitted_at: new Date().toISOString() }).eq('id', cur.session.id)
    if (closeErr) console.error('quiz session close failed:', closeErr.message)

    return json({ score: graded.score, max: graded.max, answered: graded.answered })
  }

  // ── start ──
  const startsAt = q.starts_at ? new Date(q.starts_at).getTime() : Number.NEGATIVE_INFINITY
  const endsAt = q.ends_at ? new Date(q.ends_at).getTime() : Number.POSITIVE_INFINITY
  if (now < startsAt) return bad('This quiz has not opened yet.', 403)
  if (now > endsAt) return bad('This quiz has closed.', 403)

  const limit = normalizeAttemptLimit(q.attempt_limit)

  let cur = await openSession(admin, quizId, student.userId)
  if ('error' in cur) return fail(cur.error)

  // An open attempt whose time has already run out is closed (and still counts
  // as used, so abandoning a quiz can't be used to get fresh tries).
  if (cur.session) {
    const dl = attemptDeadlineMs({ startedAt: cur.session.started_at, durationMins: q.duration_mins, endsAt: q.ends_at })
    if (now >= dl) {
      await admin.from('quiz_sessions').update({ submitted_at: new Date().toISOString() }).eq('id', cur.session.id)
      cur = { session: null }
    }
  }

  if (!cur.session) {
    const [{ count: sessionCount, error: sErr }, { count: attemptCount, error: aErr }] = await Promise.all([
      admin.from('quiz_sessions').select('id', { count: 'exact', head: true }).eq('quiz_id', quizId).eq('student_id', student.userId),
      admin.from('quiz_attempts').select('quiz_id', { count: 'exact', head: true }).eq('quiz_id', quizId).eq('student_id', student.userId),
    ])
    if (sErr) return fail(sErr)
    if (aErr) return fail(aErr)

    // Attempts made before sessions existed have no session row, so take the larger count.
    const used = Math.max(sessionCount ?? 0, attemptCount ?? 0)
    if (used >= limit) {
      return bad('You have used all your attempts for this quiz.', 403, {
        attemptsExhausted: true,
        lastAttempt: await lastAttempt(admin, quizId, student.userId),
      })
    }

    const { data: created, error: cErr } = await admin
      .from('quiz_sessions')
      .insert({ school_id: student.schoolId, quiz_id: quizId, student_id: student.userId })
      .select('id, started_at').single()

    if (cErr) {
      if ((cErr as any).code === '23505') {
        // A parallel request opened the attempt first (double tap / strict mode): resume it.
        const again = await openSession(admin, quizId, student.userId)
        if ('error' in again) return fail(again.error)
        cur = { session: again.session }
      } else {
        return fail(cErr)
      }
    } else {
      cur = { session: created as any }
    }
  }

  if (!cur.session) return bad('Could not start the quiz. Please try again.', 500)

  const deadline = attemptDeadlineMs({ startedAt: cur.session.started_at, durationMins: q.duration_mins, endsAt: q.ends_at })

  // NOTE: `answer` is deliberately not selected.
  const { data: questions, error: qsErr } = await admin
    .from('quiz_questions').select('id, text, question, options, marks, position')
    .eq('quiz_id', quizId).order('position', { ascending: true })
  if (qsErr) return fail(qsErr)

  return json({
    quiz: { id: q.id, title: q.title, total_marks: q.total_marks, duration_mins: q.duration_mins ?? null },
    questions: questions ?? [],
    secondsLeft: secondsLeft(deadline, now),
  })
}
