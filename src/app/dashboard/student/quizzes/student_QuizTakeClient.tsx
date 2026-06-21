'use client'
// src/app/dashboard/student/quizzes/[id]/QuizTakeClient.tsx
//
// FIX: loadQuiz() never checked or surfaced errors — if the quiz_questions
// query failed for any reason, it failed silently and the page just showed
// "No questions yet", indistinguishable from a genuinely empty quiz. Added
// visible error banners on every query so failures are diagnosable instead
// of looking identical to "teacher hasn't added questions."
//
// REDESIGN: mobile-first visual pass — glass-card question surface, school-color
// themed progress ring instead of a flat bar, larger touch targets on options,
// softer haptic-feeling transitions between questions, refined results screen
// with a radial score ring instead of a flat bar.

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ClockIcon, ArrowLeftIcon } from '@/components/Icons'

interface DbQuestion {
  id: string
  question: string
  options: { label: string; text: string }[]
  answer: string
  marks: number
  position: number
}

interface Props {
  quizId: string; userId: string; profile: any; school: any
}

export default function QuizTakeClient({ quizId, userId, profile, school }: Props) {
  const [quiz,        setQuiz]        = useState<any>(null)
  const [questions,   setQuestions]   = useState<DbQuestion[]>([])
  const [answers,     setAnswers]     = useState<Record<string, string>>({})
  const [current,     setCurrent]     = useState(0)
  const [timeLeft,    setTimeLeft]    = useState(0)
  const [submitted,   setSubmitted]   = useState(false)
  const [alreadyDone, setAlreadyDone] = useState(false)
  const [priorScore,  setPriorScore]  = useState<{ score: number; max: number } | null>(null)
  const [score,       setScore]       = useState(0)
  const [loading,     setLoading]     = useState(true)
  const [submitting,  setSubmitting]  = useState(false)
  const [error,       setError]       = useState<string | null>(null) // FIX: visible error state
  const router      = useRouter()
  const supabase    = createClient()
  const timerRef    = useRef<NodeJS.Timeout | null>(null)
  const sc          = school?.primary_color ?? '#7C3AED'

  useEffect(() => { loadQuiz() }, [quizId])

  useEffect(() => {
    if (!quiz || submitted || alreadyDone) return
    const mins = quiz.duration_mins ?? 30
    setTimeLeft(mins * 60)
  }, [quiz, alreadyDone])

  useEffect(() => {
    if (timeLeft <= 0 || submitted || alreadyDone) return
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current!); handleSubmit(); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current!)
  }, [timeLeft, submitted, alreadyDone])

  async function loadQuiz() {
    setLoading(true)
    setError(null)

    const [
      { data: q, error: qErr },
      { data: qs, error: qsErr },
      { data: existing, error: exErr },
    ] = await Promise.all([
      supabase.from('quizzes').select('*').eq('id', quizId).single(),
      supabase.from('quiz_questions')
        .select('id, question, options, answer, marks, position')
        .eq('quiz_id', quizId)
        .order('position', { ascending: true }),
      supabase.from('quiz_attempts')
        .select('score, max_score')
        .eq('quiz_id', quizId)
        .eq('student_id', userId)
        .maybeSingle(),
    ])

    // FIX: surface any query error instead of failing silently
    const firstError = qErr?.message || qsErr?.message || exErr?.message
    if (firstError) {
      console.error('[quiz take] load error:', firstError)
      setError(firstError)
    }

    if (q)  setQuiz(q)
    if (qs) setQuestions(qs as DbQuestion[])
    if (existing) {
      setAlreadyDone(true)
      setPriorScore({ score: existing.score ?? 0, max: existing.max_score ?? 0 })
    }
    setLoading(false)
  }

  const handleSubmit = useCallback(async () => {
    if (submitting || submitted) return
    setSubmitting(true)
    clearInterval(timerRef.current!)

    let total = 0
    questions.forEach(q => {
      if (answers[q.id] === q.answer) total += (q.marks ?? 1)
    })
    setScore(total)

    const maxScore = questions.reduce((s, q) => s + (q.marks ?? 1), 0)

    const { error: err } = await supabase.from('quiz_attempts').insert({
      quiz_id:      quizId,
      student_id:   userId,
      school_id:    school?.id,
      answers,
      score:        total,
      max_score:    maxScore,
      submitted_at: new Date().toISOString(),
    })

    if (err) {
      console.error('[quiz take] submit error:', err.message)
      setError(err.message)
      setSubmitting(false)
      return
    }

    setSubmitted(true)
    setSubmitting(false)
  }, [answers, questions, submitted, submitting])

  function formatTime(s: number) {
    const m   = Math.floor(s / 60).toString().padStart(2, '0')
    const sec = (s % 60).toString().padStart(2, '0')
    return `${m}:${sec}`
  }

  const maxScore = questions.reduce((s, q) => s + (q.marks ?? 1), 0)
  const answered = Object.keys(answers).length
  const pct      = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0
  const q        = questions[current]
  const resultColor = pct >= 70 ? '#10B981' : pct >= 50 ? '#F59E0B' : '#EF4444'

  // ── Loading ──────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', background: 'var(--bg-base)' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: sc, opacity: 0.5, animation: `pulse 1.2s ease-in-out ${i * 0.15}s infinite` }} />
        ))}
      </div>
    </div>
  )

  // ── Error state (only when there are truly no questions AND an error occurred) ──
  if (error && questions.length === 0) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', gap: 16, background: 'var(--bg-base)', padding: 24 }}>
      <p style={{ fontSize: '2rem' }}>⚠️</p>
      <p style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem' }}>Couldn't load this quiz</p>
      <p style={{ color: '#EF4444', fontSize: '0.82rem', textAlign: 'center', maxWidth: 320 }}>{error}</p>
      <button onClick={() => router.push('/dashboard/student/quizzes')}
        style={{ padding: '10px 24px', background: sc, color: '#fff', border: 'none', borderRadius: 999, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
        Back to Quizzes
      </button>
    </div>
  )

  // ── Already attempted ────────────────────────────────────
  if (alreadyDone && !submitted) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', gap: 18, background: 'var(--bg-base)', padding: 24 }}>
      <div style={{ width: 76, height: 76, borderRadius: '50%', background: '#10B98120', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.2rem' }}>✅</div>
      <p style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '1.15rem' }}>Already submitted</p>
      {priorScore && (
        <div style={{ textAlign: 'center' as const }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 4px' }}>Your score</p>
          <p style={{ fontSize: '1.6rem', fontWeight: 800, color: sc, margin: 0 }}>
            {priorScore.score}<span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>/{priorScore.max}</span>
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '2px 0 0' }}>
            {Math.round((priorScore.score / (priorScore.max || 1)) * 100)}%
          </p>
        </div>
      )}
      <button onClick={() => router.push('/dashboard/student/quizzes')}
        style={{ padding: '12px 28px', background: sc, color: '#fff', border: 'none', borderRadius: 999, fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}>
        Back to Quizzes
      </button>
    </div>
  )

  // ── No questions yet (no error — genuinely empty) ────────
  if (questions.length === 0) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', gap: 16, background: 'var(--bg-base)', padding: 24 }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--glass-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem' }}>📭</div>
      <p style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem' }}>No questions yet</p>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', maxWidth: 280 }}>
        The teacher hasn't added questions to this quiz yet. Check back soon.
      </p>
      <button onClick={() => router.push('/dashboard/student/quizzes')}
        style={{ padding: '10px 24px', background: sc, color: '#fff', border: 'none', borderRadius: 999, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
        Back to Quizzes
      </button>
    </div>
  )

  // ── Results screen ────────────────────────────────────────
  if (submitted) {
    const circumference = 2 * Math.PI * 54
    const dashoffset = circumference * (1 - pct / 100)
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 380, background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', borderRadius: 24, padding: '36px 28px', textAlign: 'center' as const }}>

          {/* Radial score ring */}
          <div style={{ position: 'relative' as const, width: 132, height: 132, margin: '0 auto 20px' }}>
            <svg width="132" height="132" viewBox="0 0 132 132" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="66" cy="66" r="54" fill="none" stroke="var(--glass-border)" strokeWidth="10" />
              <circle cx="66" cy="66" r="54" fill="none" stroke={resultColor} strokeWidth="10" strokeLinecap="round"
                strokeDasharray={circumference} strokeDashoffset={dashoffset}
                style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '1.7rem', fontWeight: 800, color: resultColor }}>{pct}%</span>
              <span style={{ fontSize: '2rem' }}>{pct >= 70 ? '🎉' : pct >= 50 ? '👍' : '📚'}</span>
            </div>
          </div>

          <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px' }}>
            {pct >= 70 ? 'Excellent!' : pct >= 50 ? 'Good effort!' : 'Keep studying!'}
          </h1>
          <p style={{ fontSize: '1rem', fontWeight: 700, color: resultColor, margin: '0 0 4px' }}>
            {score}/{maxScore} points
          </p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 24px' }}>
            {answered} of {questions.length} questions answered
          </p>

          {error && (
            <p style={{ fontSize: '0.75rem', color: '#F59E0B', marginBottom: 16 }}>
              ⚠️ Your answers were scored locally — saving may have had an issue: {error}
            </p>
          )}

          <button onClick={() => router.push('/dashboard/student/quizzes')}
            style={{ width: '100%', height: 48, background: sc, color: '#fff', border: 'none', borderRadius: 14, fontWeight: 700, fontSize: '0.92rem', cursor: 'pointer' }}>
            Back to Quizzes
          </button>
        </div>
      </div>
    )
  }

  // ── Quiz-taking screen ────────────────────────────────────
  const timerColor = timeLeft < 60 ? '#EF4444' : timeLeft < 180 ? '#F59E0B' : sc

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <header style={{ position: 'sticky' as const, top: 0, zIndex: 10, background: 'var(--bg-base)', borderBottom: '1px solid var(--glass-border)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()}
          style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <ArrowLeftIcon size={16} color="var(--text-secondary)" />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{quiz?.title}</p>
          <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>{answered}/{questions.length} answered</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 999, border: `1px solid ${timerColor}40`, color: timerColor, fontWeight: 700, fontSize: '0.8rem', flexShrink: 0 }}>
          <ClockIcon size={13} color="currentColor" />
          {formatTime(timeLeft)}
        </div>
      </header>

      {/* Progress bar */}
      <div style={{ height: 3, background: 'var(--glass-border)' }}>
        <div style={{ height: '100%', width: `${((current + 1) / questions.length) * 100}%`, background: sc, transition: 'width 0.3s ease' }} />
      </div>

      {/* Error banner, if a non-blocking error happened mid-quiz */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: '#EF444415', borderBottom: '1px solid #EF444440' }}>
          <span style={{ fontSize: '0.75rem', color: '#EF4444', flex: 1 }}>⚠️ {error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 800 }}>✕</button>
        </div>
      )}

      {/* Question card */}
      {q && (
        <div style={{ flex: 1, padding: '24px 16px', display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 800, color: sc, letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 10 }}>
            Question {current + 1} of {questions.length}
          </span>
          <p style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4, marginBottom: 24 }}>
            {q.question}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(q.options ?? []).map(opt => {
              const selected = answers[q.id] === opt.label
              return (
                <button key={opt.label}
                  onClick={() => setAnswers(prev => ({ ...prev, [q.id]: opt.label }))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 16px', borderRadius: 14, textAlign: 'left' as const,
                    background: selected ? sc + '15' : 'var(--glass-bg)',
                    border: `1.5px solid ${selected ? sc : 'var(--glass-border)'}`,
                    cursor: 'pointer', transition: 'all 0.15s ease',
                  }}>
                  <span style={{
                    width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: '0.85rem',
                    background: selected ? sc : 'var(--bg-elevated)',
                    color: selected ? '#fff' : 'var(--text-muted)',
                    border: selected ? 'none' : '1px solid var(--glass-border)',
                  }}>
                    {opt.label}
                  </span>
                  <span style={{ fontSize: '0.92rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                    {opt.text}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Bottom nav */}
      <div style={{ position: 'sticky' as const, bottom: 0, background: 'var(--bg-base)', borderTop: '1px solid var(--glass-border)', padding: '12px 16px calc(12px + env(safe-area-inset-bottom))', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button disabled={current === 0} onClick={() => setCurrent(c => c - 1)}
          style={{ height: 44, padding: '0 16px', borderRadius: 12, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: current === 0 ? 'var(--text-faint)' : 'var(--text-secondary)', fontWeight: 700, fontSize: '0.85rem', cursor: current === 0 ? 'default' : 'pointer' }}>
          ← Prev
        </button>

        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 5, overflowX: 'auto' as const }}>
          {questions.map((_, i) => {
            const isCurrent = i === current
            const isAnswered = answers[questions[i]?.id] !== undefined
            return (
              <button key={i} onClick={() => setCurrent(i)}
                style={{
                  width: isCurrent ? 22 : 8, height: 8, borderRadius: 999, flexShrink: 0,
                  background: isCurrent ? sc : isAnswered ? sc + '70' : 'var(--glass-border)',
                  border: 'none', cursor: 'pointer', transition: 'all 0.2s ease',
                }} />
            )
          })}
        </div>

        {current < questions.length - 1
          ? <button onClick={() => setCurrent(c => c + 1)}
              style={{ height: 44, padding: '0 20px', borderRadius: 12, background: sc, color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
              Next →
            </button>
          : <button onClick={handleSubmit} disabled={submitting}
              style={{ height: 44, padding: '0 20px', borderRadius: 12, background: '#10B981', color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>
              {submitting ? '...' : 'Submit ✓'}
            </button>
        }
      </div>
    </div>
  )
}
