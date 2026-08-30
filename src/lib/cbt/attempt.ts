// src/lib/cbt/attempt.ts
// -------------------------------------------------------
// Server-only helpers shared by the CBT API routes (start/autosave/
// submit/status). Anything that touches the database or Date.now()
// lives here, kept separate from the pure grading math in grading.ts.
// -------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js'
import { calculateExamResult, type GradableQuestion, type SubmittedAnswer } from './grading'

export interface DbQuizRow {
  id: string
  school_id: string | null
  class_id: string | null
  teacher_id: string | null
  mode: string
  status: string
  duration_mins: number | null
  attempt_limit: number
  starts_at: string
  ends_at: string
  scheduled_at: string | null
  closes_at: string | null
  randomize_questions: boolean
  randomize_options: boolean
  allow_resume: boolean
  pass_mark: number | null
}

export interface EligibilityResult {
  eligible: boolean
  reason?: string
  status?: number
}

/**
 * Server-side eligibility gate, run before every attempt-start. Mirrors
 * §7 of the CBT spec: auth, school match, timing window, attempt limit
 * are all checked here — never on the client.
 */
export function checkStartEligibility(opts: {
  quiz: DbQuizRow | null
  studentSchoolId: string | null
  studentClassId: string | null
  now: Date
  priorAttempt: { status: string } | null
}): EligibilityResult {
  const { quiz, studentSchoolId, studentClassId, now, priorAttempt } = opts

  if (!quiz) return { eligible: false, reason: 'This quiz could not be found.', status: 404 }
  // NOTE: quizzes.status is not currently set/managed anywhere in the
  // teacher creation flow — every row sits at its DB default ('draft')
  // indefinitely. The existing product's real "is this quiz live"
  // signal is the starts_at/ends_at time window below, not this column.
  // A future publish step could set status='archived' to hard-close a
  // quiz early; that's honored here, but 'draft' is deliberately NOT
  // treated as blocking, or this would lock every quiz ever created.
  if (quiz.status === 'archived') return { eligible: false, reason: 'This quiz has been archived.', status: 403 }
  if (quiz.school_id && quiz.school_id !== studentSchoolId) {
    return { eligible: false, reason: 'This quiz does not belong to your school.', status: 403 }
  }
  if (quiz.class_id && studentClassId && quiz.class_id !== studentClassId) {
    return { eligible: false, reason: 'This quiz is not assigned to your class.', status: 403 }
  }

  const startsAt = quiz.scheduled_at ?? quiz.starts_at
  const endsAt   = quiz.closes_at ?? quiz.ends_at
  if (startsAt && now < new Date(startsAt)) {
    return { eligible: false, reason: 'This quiz has not opened yet.', status: 403 }
  }
  if (endsAt && now > new Date(endsAt)) {
    return { eligible: false, reason: 'The window for this quiz has closed.', status: 403 }
  }

  if (priorAttempt) {
    const finished = ['submitted', 'auto_submitted', 'invalidated', 'cancelled'].includes(priorAttempt.status)
    if (finished) {
      return { eligible: false, reason: 'You have already completed this quiz.', status: 409 }
    }
    if (priorAttempt.status === 'in_progress' && !quiz.allow_resume) {
      return { eligible: false, reason: 'This quiz does not allow resuming a previous session.', status: 403 }
    }
    // in_progress + allow_resume → caller resumes, not a fresh start
  }

  return { eligible: true }
}

/** Fisher-Yates shuffle. Does not mutate the input array. */
export function shuffle<T>(items: T[]): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export interface RawQuestion {
  id: string
  text: string | null
  question: string | null
  options: { label: string; text: string }[]
  answer: string | null
  correct_option: number | null
  marks: number | null
  position: number | null
}

export interface FrozenPaper {
  questionOrder: string[]
  optionOrder: Record<string, string[]> // questionId -> shuffled option labels
}

/** Called ONCE at attempt start. The result is stored on the attempt row and reused verbatim on every resume — never regenerated. */
export function buildFrozenPaper(questions: RawQuestion[], randomizeQuestions: boolean, randomizeOptions: boolean): FrozenPaper {
  const baseOrder = [...questions].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map(q => q.id)
  const questionOrder = randomizeQuestions ? shuffle(baseOrder) : baseOrder

  const optionOrder: Record<string, string[]> = {}
  for (const q of questions) {
    const labels = (q.options ?? []).map(o => o.label)
    optionOrder[q.id] = randomizeOptions ? shuffle(labels) : labels
  }
  return { questionOrder, optionOrder }
}

/** Strips correct-answer fields and applies the frozen order — this is the ONLY shape ever sent to the browser while an attempt is in progress. */
export function sanitizeQuestionsForClient(questions: RawQuestion[], paper: FrozenPaper) {
  const byId = new Map(questions.map(q => [q.id, q]))
  return paper.questionOrder
    .map(id => byId.get(id))
    .filter((q): q is RawQuestion => !!q)
    .map(q => {
      const order = paper.optionOrder[q.id] ?? q.options.map(o => o.label)
      const optByLabel = new Map(q.options.map(o => [o.label, o]))
      return {
        id: q.id,
        text: q.text || q.question,
        marks: q.marks ?? 1,
        options: order.map(label => optByLabel.get(label)).filter(Boolean),
        // NOTE: no `answer`, no `correct_option` — ever.
      }
    })
}

/**
 * Lazy expiry: serverless has no persistent timer, so instead every
 * attempt-touching route calls this first. If the attempt is
 * in_progress and past expires_at, grade + finalize it right now before
 * doing anything else, so no route can ever act on a paper that should
 * already be closed.
 */
export async function finalizeIfExpired(
  admin: SupabaseClient,
  attempt: { id: string; quiz_id: string; status: string; expires_at: string | null; answers: Record<string, string> },
): Promise<{ finalized: boolean }> {
  if (attempt.status !== 'in_progress') return { finalized: false }
  if (!attempt.expires_at || new Date(attempt.expires_at) > new Date()) return { finalized: false }

  await gradeAndFinalize(admin, attempt, { autoSubmitted: true })
  return { finalized: true }
}

/** Authoritative grade + finalize. Reads correct answers from the DB itself — never from the request body. */
export async function gradeAndFinalize(
  admin: SupabaseClient,
  attempt: { id: string; quiz_id: string; answers: Record<string, string> },
  opts: { autoSubmitted: boolean },
) {
  const [{ data: quiz }, { data: questions }] = await Promise.all([
    admin.from('quizzes').select('pass_mark').eq('id', attempt.quiz_id).single(),
    admin.from('quiz_questions').select('id, answer, marks').eq('quiz_id', attempt.quiz_id),
  ])

  const gradable: GradableQuestion[] = (questions ?? []).map(q => ({
    id: q.id, type: 'objective', answer: q.answer ?? null, marks: q.marks ?? 1,
  }))
  const submitted: SubmittedAnswer[] = Object.entries(attempt.answers ?? {}).map(([questionId, value]) => ({
    questionId, value,
  }))

  const result = calculateExamResult(gradable, submitted, quiz?.pass_mark ?? null)

  const { error } = await admin.from('quiz_attempts').update({
    status: opts.autoSubmitted ? 'auto_submitted' : 'submitted',
    auto_submitted: opts.autoSubmitted,
    completed: true,
    score: result.totalAwarded,
    max_score: result.totalPossible,
    percentage: result.percentage,
    passed: result.passed,
    submitted_at: new Date().toISOString(),
  }).eq('id', attempt.id)

  if (error) throw new Error(error.message)
  return result
}
