// src/lib/quizGrading.ts
//
// Pure helpers for server-side quiz grading and timing, so the rules live in
// one tested place instead of in the student's browser.

export const SUBMIT_GRACE_MS = 2 * 60 * 1000
export const DEFAULT_DURATION_MINS = 30

export interface GradableQuestion {
  id: string
  answer: unknown
  marks: number | null
}

export interface GradeResult {
  score: number
  max: number
  answered: number
  /** The answers that were actually accepted (known question ids, string values). */
  cleaned: Record<string, string>
}

/**
 * Marks a submission. Only answers for questions that belong to the quiz are
 * considered; anything else a client sends is ignored. A missing `marks`
 * counts as 1 (same as the old client-side behaviour).
 */
export function gradeAnswers(questions: GradableQuestion[], answers: unknown): GradeResult {
  const given = answers && typeof answers === 'object' && !Array.isArray(answers)
    ? (answers as Record<string, unknown>)
    : {}

  let score = 0
  let max = 0
  let answered = 0
  const cleaned: Record<string, string> = {}

  for (const q of questions) {
    const marks = typeof q.marks === 'number' && Number.isFinite(q.marks) ? q.marks : 1
    max += marks
    const a = given[q.id]
    if (typeof a !== 'string' || a.trim() === '') continue
    answered++
    cleaned[q.id] = a.trim().slice(0, 50)
    if (a.trim() === String(q.answer ?? '').trim()) score += marks
  }
  return { score, max, answered, cleaned }
}

/**
 * The moment an attempt must be submitted by: the earlier of (start + duration)
 * and the quiz's closing time. Returns epoch ms.
 */
export function attemptDeadlineMs(opts: {
  startedAt: string | Date
  durationMins: number | null | undefined
  endsAt: string | Date | null | undefined
}): number {
  const started = new Date(opts.startedAt).getTime()
  const mins = opts.durationMins && opts.durationMins > 0 ? opts.durationMins : DEFAULT_DURATION_MINS
  const byDuration = started + mins * 60 * 1000
  const ends = opts.endsAt ? new Date(opts.endsAt).getTime() : Number.POSITIVE_INFINITY
  return Math.min(byDuration, Number.isNaN(ends) ? Number.POSITIVE_INFINITY : ends)
}

export function secondsLeft(deadlineMs: number, nowMs: number): number {
  return Math.max(0, Math.floor((deadlineMs - nowMs) / 1000))
}

export function normalizeAttemptLimit(limit: unknown): number {
  const n = Number(limit)
  return Number.isInteger(n) && n >= 1 ? n : 1
}
