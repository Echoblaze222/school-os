import { describe, it, expect } from 'vitest'
import {
  gradeAnswers,
  attemptDeadlineMs,
  secondsLeft,
  normalizeAttemptLimit,
  DEFAULT_DURATION_MINS,
} from '../quizGrading'

const qs = [
  { id: 'q1', answer: 'A', marks: 2 },
  { id: 'q2', answer: 'B', marks: 1 },
  { id: 'q3', answer: 'C', marks: null },
]

describe('gradeAnswers', () => {
  it('scores correct answers by their marks', () => {
    const r = gradeAnswers(qs, { q1: 'A', q2: 'B', q3: 'C' })
    expect(r).toMatchObject({ score: 4, max: 4, answered: 3 })
  })

  it('treats missing marks as 1 and counts only correct answers', () => {
    const r = gradeAnswers(qs, { q1: 'B', q2: 'B', q3: 'C' })
    expect(r.score).toBe(2)
    expect(r.max).toBe(4)
  })

  it('ignores unanswered, blank and non-string answers', () => {
    const r = gradeAnswers(qs, { q1: '', q2: 5, q3: null })
    expect(r).toMatchObject({ score: 0, answered: 0, cleaned: {} })
  })

  it('ignores answers for questions that are not in the quiz', () => {
    const r = gradeAnswers(qs, { q1: 'A', nope: 'A', __proto__: 'A' })
    expect(r.cleaned).toEqual({ q1: 'A' })
    expect(r.score).toBe(2)
  })

  it('survives garbage input', () => {
    expect(gradeAnswers(qs, null).score).toBe(0)
    expect(gradeAnswers(qs, 'A').score).toBe(0)
    expect(gradeAnswers(qs, ['A']).score).toBe(0)
    expect(gradeAnswers([], { q1: 'A' })).toMatchObject({ score: 0, max: 0 })
  })

  it('trims whitespace on both sides', () => {
    expect(gradeAnswers([{ id: 'q1', answer: ' A ', marks: 1 }], { q1: 'A ' }).score).toBe(1)
  })
})

describe('attemptDeadlineMs', () => {
  const start = '2026-10-27T10:00:00Z'
  const t = (s: string) => new Date(s).getTime()

  it('is start + duration when the quiz is still open long enough', () => {
    expect(attemptDeadlineMs({ startedAt: start, durationMins: 20, endsAt: '2026-10-27T18:00:00Z' }))
      .toBe(t('2026-10-27T10:20:00Z'))
  })

  it('is capped by the quiz closing time', () => {
    expect(attemptDeadlineMs({ startedAt: start, durationMins: 60, endsAt: '2026-10-27T10:15:00Z' }))
      .toBe(t('2026-10-27T10:15:00Z'))
  })

  it('falls back to the default duration and ignores a missing end', () => {
    expect(attemptDeadlineMs({ startedAt: start, durationMins: null, endsAt: null }))
      .toBe(t(start) + DEFAULT_DURATION_MINS * 60000)
  })
})

describe('secondsLeft', () => {
  it('counts down and never goes negative', () => {
    expect(secondsLeft(10_000, 4_000)).toBe(6)
    expect(secondsLeft(10_000, 20_000)).toBe(0)
  })
})

describe('normalizeAttemptLimit', () => {
  it('defaults to 1 for missing or invalid limits', () => {
    expect(normalizeAttemptLimit(null)).toBe(1)
    expect(normalizeAttemptLimit(0)).toBe(1)
    expect(normalizeAttemptLimit('abc')).toBe(1)
    expect(normalizeAttemptLimit(2.5)).toBe(1)
  })
  it('keeps valid limits', () => {
    expect(normalizeAttemptLimit(3)).toBe(3)
    expect(normalizeAttemptLimit('2')).toBe(2)
  })
})
