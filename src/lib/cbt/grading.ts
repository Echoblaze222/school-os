// src/lib/cbt/grading.ts
// -------------------------------------------------------
// Pure grading functions for the CBT engine. No I/O, no Supabase, no
// Date.now() side effects — everything the caller needs comes in as an
// argument. This is what makes them safe to unit test and safe to call
// from a route without worrying about accidentally trusting the client.
//
// The API routes are the only place that decide WHICH answers are
// authoritative (they read `answer`/`correct_option` from the database
// with the service-role client) — these functions just do arithmetic on
// whatever they're given.
// -------------------------------------------------------

export interface GradableQuestion {
  id:      string
  /** 'objective' can be auto-graded now. 'theory' always needs a human. */
  type:    'objective' | 'theory'
  /** Authoritative correct option label, e.g. "A". Objective only. */
  answer:  string | null
  marks:   number
}

export interface SubmittedAnswer {
  questionId: string
  /** The option label the student selected, or free text for theory. */
  value: string | null
}

export interface QuestionScore {
  questionId: string
  awarded:    number
  possible:   number
  correct:    boolean | null // null for theory (not yet gradable)
  graded:     boolean
}

/** Score a single question against the authoritative answer. Never trusts anything from the client except which option was picked. */
export function calculateQuestionScore(
  question: GradableQuestion,
  submitted: SubmittedAnswer | undefined,
): QuestionScore {
  const possible = question.marks ?? 1

  if (question.type === 'theory') {
    return { questionId: question.id, awarded: 0, possible, correct: null, graded: false }
  }

  const value = submitted?.value ?? null
  const correct = value !== null && value === question.answer
  return {
    questionId: question.id,
    awarded: correct ? possible : 0,
    possible,
    correct,
    graded: true,
  }
}

/** Score every question in a paper. */
export function calculateTotalScore(
  questions: GradableQuestion[],
  answers: SubmittedAnswer[],
): { scores: QuestionScore[]; totalAwarded: number; totalPossible: number; fullyGraded: boolean } {
  const byId = new Map(answers.map(a => [a.questionId, a]))
  const scores = questions.map(q => calculateQuestionScore(q, byId.get(q.id)))
  const totalAwarded  = scores.reduce((sum, s) => sum + s.awarded, 0)
  const totalPossible = scores.reduce((sum, s) => sum + s.possible, 0)
  const fullyGraded   = scores.every(s => s.graded)
  return { scores, totalAwarded, totalPossible, fullyGraded }
}

export function calculatePercentage(totalAwarded: number, totalPossible: number): number {
  if (totalPossible <= 0) return 0
  return Math.round((totalAwarded / totalPossible) * 10000) / 100 // 2dp
}

export function determinePassStatus(percentage: number, passMark: number | null | undefined): boolean | null {
  if (passMark === null || passMark === undefined) return null
  return percentage >= passMark
}

export interface ExamResult {
  scores:        QuestionScore[]
  totalAwarded:  number
  totalPossible: number
  percentage:    number
  passed:        boolean | null
  fullyGraded:   boolean
  answeredCount: number
}

/** Top-level convenience wrapper used by the submit route. */
export function calculateExamResult(
  questions: GradableQuestion[],
  answers: SubmittedAnswer[],
  passMark: number | null | undefined,
): ExamResult {
  const { scores, totalAwarded, totalPossible, fullyGraded } = calculateTotalScore(questions, answers)
  const percentage = calculatePercentage(totalAwarded, totalPossible)
  const answeredCount = answers.filter(a => a.value !== null && a.value !== undefined && a.value !== '').length
  return {
    scores, totalAwarded, totalPossible, percentage, fullyGraded, answeredCount,
    // Never claim pass/fail off a paper that isn't fully objectively
    // graded yet (theory questions pending) — leave it null, the caller
    // decides whether to hold results per the exam's release mode.
    passed: fullyGraded ? determinePassStatus(percentage, passMark) : null,
  }
}
