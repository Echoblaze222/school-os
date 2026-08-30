// src/lib/cbt/grading.test.ts
import { describe, it, expect } from 'vitest'
import {
  calculateQuestionScore, calculateTotalScore, calculatePercentage,
  determinePassStatus, calculateExamResult, type GradableQuestion,
} from './grading'

const objQ = (id: string, answer: string, marks = 1): GradableQuestion => ({ id, type: 'objective', answer, marks })
const theoryQ = (id: string, marks = 5): GradableQuestion => ({ id, type: 'theory', answer: null, marks })

describe('calculateQuestionScore', () => {
  it('awards full marks for a correct answer', () => {
    const r = calculateQuestionScore(objQ('q1', 'B', 2), { questionId: 'q1', value: 'B' })
    expect(r).toEqual({ questionId: 'q1', awarded: 2, possible: 2, correct: true, graded: true })
  })

  it('awards zero for a wrong answer', () => {
    const r = calculateQuestionScore(objQ('q1', 'B'), { questionId: 'q1', value: 'A' })
    expect(r.awarded).toBe(0)
    expect(r.correct).toBe(false)
  })

  it('never awards marks for an unanswered question, even with a null value from the client', () => {
    const r = calculateQuestionScore(objQ('q1', 'B'), undefined)
    expect(r.awarded).toBe(0)
    expect(r.correct).toBe(false)
  })

  it('is not fooled by an empty-string answer matching a falsy correct answer', () => {
    const r = calculateQuestionScore(objQ('q1', ''), { questionId: 'q1', value: null })
    expect(r.correct).toBe(false) // value === null never equals answer, even if answer is ''
  })

  it('leaves theory questions ungraded, never auto-scored', () => {
    const r = calculateQuestionScore(theoryQ('q2', 10), { questionId: 'q2', value: 'A long essay answer.' })
    expect(r.graded).toBe(false)
    expect(r.correct).toBeNull()
    expect(r.awarded).toBe(0)
  })
})

describe('calculateTotalScore', () => {
  it('sums awarded/possible across a mixed paper', () => {
    const questions = [objQ('q1', 'A', 2), objQ('q2', 'C', 3), objQ('q3', 'B', 1)]
    const answers = [
      { questionId: 'q1', value: 'A' }, // correct, +2
      { questionId: 'q2', value: 'B' }, // wrong, +0
      { questionId: 'q3', value: 'B' }, // correct, +1
    ]
    const { totalAwarded, totalPossible, fullyGraded } = calculateTotalScore(questions, answers)
    expect(totalAwarded).toBe(3)
    expect(totalPossible).toBe(6)
    expect(fullyGraded).toBe(true)
  })

  it('flags fullyGraded=false when a theory question is present', () => {
    const { fullyGraded } = calculateTotalScore([objQ('q1', 'A'), theoryQ('q2')], [{ questionId: 'q1', value: 'A' }])
    expect(fullyGraded).toBe(false)
  })
})

describe('calculatePercentage', () => {
  it('rounds to 2dp', () => {
    expect(calculatePercentage(1, 3)).toBe(33.33)
  })
  it('returns 0 for a zero-possible paper instead of dividing by zero', () => {
    expect(calculatePercentage(0, 0)).toBe(0)
  })
})

describe('determinePassStatus', () => {
  it('returns null when no pass mark is configured', () => {
    expect(determinePassStatus(90, null)).toBeNull()
    expect(determinePassStatus(90, undefined)).toBeNull()
  })
  it('passes at exactly the pass mark', () => {
    expect(determinePassStatus(50, 50)).toBe(true)
  })
  it('fails just under the pass mark', () => {
    expect(determinePassStatus(49.99, 50)).toBe(false)
  })
})

describe('calculateExamResult', () => {
  it('withholds pass/fail until every question is objectively graded', () => {
    const result = calculateExamResult([objQ('q1', 'A'), theoryQ('q2')], [{ questionId: 'q1', value: 'A' }], 50)
    expect(result.passed).toBeNull()
  })

  it('computes a full result for an all-objective paper', () => {
    const questions = [objQ('q1', 'A'), objQ('q2', 'B'), objQ('q3', 'C'), objQ('q4', 'D')]
    const answers = [
      { questionId: 'q1', value: 'A' }, { questionId: 'q2', value: 'B' },
      { questionId: 'q3', value: 'X' }, { questionId: 'q4', value: null },
    ]
    const result = calculateExamResult(questions, answers, 50)
    expect(result.totalAwarded).toBe(2)
    expect(result.totalPossible).toBe(4)
    expect(result.percentage).toBe(50)
    expect(result.passed).toBe(true)
    expect(result.answeredCount).toBe(3) // q4's null doesn't count as answered
  })

  it('never trusts a client-supplied score - only the authoritative answer key matters', () => {
    // Even if a malicious client sent extra fields alongside `value`, the
    // function signature only accepts questionId/value - there is no
    // score/percentage/passed field it could inject here.
    const questions = [objQ('q1', 'A', 100)]
    const answers = [{ questionId: 'q1', value: 'A' } as any]
    const result = calculateExamResult(questions, answers, 50)
    expect(result.totalAwarded).toBe(100)
  })
})
