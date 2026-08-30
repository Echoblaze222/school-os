'use client'
// src/app/dashboard/student/quizzes/[id]/QuizTakeClient.tsx
//
// SECURITY REWRITE (CBT hardening pass): this component used to query
// `quiz_questions` directly from the browser — including the `answer`
// column — and scored the attempt client-side with a plain setInterval
// countdown. Both were trivially defeatable from devtools (read the
// answer key straight off the network tab; edit the client clock/score
// before the insert). Every request now goes through
// /api/examination/quizzes/[quizId]/*, which:
//   - never sends `answer`/`correct_option` to the browser
//   - computes the timer from `expires_at`, set once server-side
//   - grades and persists the final score itself, from the DB, on submit
//   - autosaves each answer to the server (Saved / Saving.../ Offline)
//   - freezes question/option order once at start, reused verbatim on resume
//
// The visual design (glass-card, radial score ring, progress dots,
// design tokens) is unchanged from the previous pass — only the data
// layer changed.

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ClockIcon, ArrowLeftIcon, AlertIcon, XIcon, PartyPopperIcon, CheckCircleIcon,
  BookOpenIcon, AwardIcon, SaveIcon, WifiOffIcon, RefreshIcon,
} from '@/components/Icons'
import motion from '@/components/dashboard-motion.module.css'

interface ClientQuestion {
  id: string
  text: string
  marks: number
  options: { label: string; text: string }[]
}

interface Props {
  quizId: string; userId: string; profile: any; school: any
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'error'
type Phase = 'loading' | 'error' | 'already_done' | 'no_questions' | 'in_progress' | 'submitted'

export default function QuizTakeClient({ quizId, userId, profile, school }: Props) {
  const [phase,       setPhase]       = useState<Phase>('loading')
  const [quiz,        setQuiz]        = useState<any>(null)
  const [questions,   setQuestions]   = useState<ClientQuestion[]>([])
  const [answers,     setAnswers]     = useState<Record<string, string>>({})
  const [current,     setCurrent]     = useState(0)
  const [attemptId,   setAttemptId]   = useState<string | null>(null)
  const [expiresAt,   setExpiresAt]   = useState<number | null>(null) // epoch ms
  const [clockOffset, setClockOffset] = useState(0) // serverNow - Date.now(), applied to local ticking
  const [timeLeft,    setTimeLeft]    = useState(0)
  const [result,      setResult]      = useState<{ score: number; maxScore: number; percentage: number; passed: boolean | null } | null>(null)
  const [error,       setError]       = useState<string | null>(null)
  const [submitting,  setSubmitting]  = useState(false)
  const [saveStatus,  setSaveStatus]  = useState<SaveStatus>('idle')
  const [showConfirm, setShowConfirm] = useState(false)

  const router      = useRouter()
  const timerRef       = useRef<NodeJS.Timeout | null>(null)
  const autosaveTimer   = useRef<NodeJS.Timeout | null>(null)
  const statusPollRef    = useRef<NodeJS.Timeout | null>(null)
  const pendingAnswers  = useRef<Record<string, string>>({}) // changes not yet confirmed saved
  const sc          = school?.primary_color ?? '#800020'

  const serverNow = useCallback(() => Date.now() + clockOffset, [clockOffset])

  // ── Start / resume ───────────────────────────────────────────────────
  useEffect(() => { start() }, [quizId])

  async function start() {
    setPhase('loading')
    setError(null)
    try {
      const res = await fetch(`/api/examination/quizzes/${quizId}/start`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error || "Couldn't load this quiz.")
        setPhase(data.error?.toLowerCase().includes('already') ? 'already_done' : 'error')
        if (data.attempt) setResult({ score: data.attempt.score ?? 0, maxScore: data.attempt.maxScore ?? 0, percentage: data.attempt.percentage ?? 0, passed: data.attempt.passed ?? null })
        return
      }

      setQuiz(data.quiz)
      setClockOffset(new Date(data.serverNow).getTime() - Date.now())

      if (data.alreadyDone) {
        setResult({ score: data.attempt.score ?? 0, maxScore: data.attempt.maxScore ?? 0, percentage: data.attempt.percentage ?? 0, passed: data.attempt.passed ?? null })
        setPhase('already_done')
        return
      }
      if (!data.attempt || data.questions.length === 0) {
        setPhase('no_questions')
        return
      }

      setQuestions(data.questions)
      setAnswers(data.attempt.answers ?? {})
      setAttemptId(data.attempt.id)
      setExpiresAt(new Date(data.attempt.expiresAt).getTime())
      setPhase('in_progress')
    } catch (err: any) {
      setError('Network error — check your connection and try again.')
      setPhase('error')
    }
  }

  // ── Server-truth countdown ───────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'in_progress' || !expiresAt) return
    timerRef.current = setInterval(() => {
      const left = Math.max(0, Math.round((expiresAt - serverNow()) / 1000))
      setTimeLeft(left)
      if (left <= 0) { clearInterval(timerRef.current!); handleSubmit(true) }
    }, 1000)
    return () => clearInterval(timerRef.current!)
  }, [phase, expiresAt, serverNow])

  // ── Periodic resync with server (catches auto-submit from elsewhere, clock drift) ──
  useEffect(() => {
    if (phase !== 'in_progress') return
    statusPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/examination/quizzes/${quizId}/status`)
        const data = await res.json()
        if (!data.ok || !data.attempt) return
        setClockOffset(new Date(data.serverNow).getTime() - Date.now())
        if (data.attempt.status !== 'in_progress') {
          setResult({ score: data.attempt.score ?? 0, maxScore: data.attempt.maxScore ?? 0, percentage: data.attempt.percentage ?? 0, passed: data.attempt.passed ?? null })
          setPhase('submitted')
        }
      } catch { /* transient — next poll will retry */ }
    }, 25_000)
    return () => clearInterval(statusPollRef.current!)
  }, [phase, quizId])

  // ── Tab/window/fullscreen event logging (deterrent + audit only) ─────
  useEffect(() => {
    if (phase !== 'in_progress') return
    const send = (eventType: string) => {
      fetch(`/api/examination/quizzes/${quizId}/event`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType }),
      }).catch(() => {})
    }
    const onVisibility = () => send(document.hidden ? 'tab_hidden' : 'window_focus')
    const onBlur  = () => send('window_blur')
    window.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onBlur)
    }
  }, [phase, quizId])

  // ── Autosave: debounce local edits, always persist server-side ───────
  function queueAnswer(questionId: string, value: string) {
    setAnswers(prev => ({ ...prev, [questionId]: value }))
    pendingAnswers.current[questionId] = value
    setSaveStatus('saving')
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(flushAutosave, 800)
  }

  async function flushAutosave() {
    if (Object.keys(pendingAnswers.current).length === 0) return
    const batch = pendingAnswers.current
    pendingAnswers.current = {}
    try {
      const res = await fetch(`/api/examination/quizzes/${quizId}/autosave`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: batch }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        if (data.expired) { setError('Time is up — your quiz was submitted automatically.'); await handleSubmit(true); return }
        // Requeue this batch so the next successful save picks it up.
        pendingAnswers.current = { ...batch, ...pendingAnswers.current }
        setSaveStatus('offline')
        return
      }
      setSaveStatus('saved')
    } catch {
      pendingAnswers.current = { ...batch, ...pendingAnswers.current }
      setSaveStatus('offline')
    }
  }

  // Retry a stalled autosave every 6s while offline, instead of losing the answer.
  useEffect(() => {
    if (saveStatus !== 'offline') return
    const t = setInterval(flushAutosave, 6000)
    return () => clearInterval(t)
  }, [saveStatus])

  const handleSubmit = useCallback(async (auto = false) => {
    if (submitting) return
    setSubmitting(true)
    clearInterval(timerRef.current!)
    clearInterval(statusPollRef.current!)
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    await flushAutosave() // last chance to persist anything still pending

    try {
      const res = await fetch(`/api/examination/quizzes/${quizId}/submit`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error || "We couldn't submit your quiz. Your answers are saved — try again.")
        setSubmitting(false)
        return
      }
      setResult({ score: data.result.score, maxScore: data.result.maxScore, percentage: data.result.percentage, passed: data.result.passed })
      setPhase('submitted')
      setShowConfirm(false)
    } catch {
      setError("Couldn't reach the server to submit. Your answers are saved — try again when you're back online.")
    } finally {
      setSubmitting(false)
    }
  }, [submitting, quizId])

  function formatTime(s: number) {
    const m   = Math.floor(s / 60).toString().padStart(2, '0')
    const sec = (s % 60).toString().padStart(2, '0')
    return `${m}:${sec}`
  }

  const maxScore = questions.reduce((s, q) => s + (q.marks ?? 1), 0)
  const answeredIds = Object.keys(answers).filter(id => answers[id])
  const answered = answeredIds.length
  const unanswered = questions.length - answered
  const pct = result ? Math.round(result.percentage) : 0
  const q   = questions[current]
  const resultColor = pct >= 70 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)'

  // ── Loading ──────────────────────────────────────────────
  if (phase === 'loading') return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', background: 'var(--bg-base)' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: sc, opacity: 0.5, animation: `pulse 1.2s ease-in-out ${i * 0.15}s infinite` }} />
        ))}
      </div>
    </div>
  )

  // ── Error state ────────────────────────────────────────────
  if (phase === 'error') return (
    <div className={motion.riseIn} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', gap: 16, background: 'var(--bg-base)', padding: 24 }}>
      <AlertIcon size={40} color="var(--danger)" strokeWidth={1.5} />
      <p style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem' }}>Couldn't load this quiz</p>
      <p style={{ color: 'var(--danger)', fontSize: '0.82rem', textAlign: 'center', maxWidth: 320 }}>{error}</p>
      <button onClick={() => router.push('/dashboard/student/quizzes')} className={motion.pressable}
        style={{ padding: '10px 24px', background: sc, color: '#fff', border: 'none', borderRadius: 999, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
        Back to Quizzes
      </button>
    </div>
  )

  // ── Already attempted ────────────────────────────────────
  if (phase === 'already_done') return (
    <div className={motion.riseIn} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', gap: 18, background: 'var(--bg-base)', padding: 24 }}>
      <div style={{ width: 76, height: 76, borderRadius: '50%', background: 'var(--success-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CheckCircleIcon size={36} color="var(--success)" />
      </div>
      <p style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '1.15rem' }}>Already submitted</p>
      {result && (
        <div style={{ textAlign: 'center' as const }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 4px' }}>Your score</p>
          <p style={{ fontSize: '1.6rem', fontWeight: 800, color: sc, margin: 0 }}>
            {result.score}<span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>/{result.maxScore}</span>
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '2px 0 0' }}>{Math.round(result.percentage)}%</p>
        </div>
      )}
      <button onClick={() => router.push('/dashboard/student/quizzes')} className={motion.pressable}
        style={{ padding: '12px 28px', background: sc, color: '#fff', border: 'none', borderRadius: 999, fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}>
        Back to Quizzes
      </button>
    </div>
  )

  // ── No questions yet ──────────────────────────────────────
  if (phase === 'no_questions') return (
    <div className={motion.riseIn} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', gap: 16, background: 'var(--bg-base)', padding: 24 }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--glass-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <AwardIcon size={28} color="var(--text-faint)" strokeWidth={1.5} />
      </div>
      <p style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem' }}>No questions yet</p>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', maxWidth: 280 }}>
        The teacher hasn't added questions to this quiz yet. Check back soon.
      </p>
      <button onClick={() => router.push('/dashboard/student/quizzes')} className={motion.pressable}
        style={{ padding: '10px 24px', background: sc, color: '#fff', border: 'none', borderRadius: 999, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
        Back to Quizzes
      </button>
    </div>
  )

  // ── Results screen ────────────────────────────────────────
  if (phase === 'submitted' && result) {
    const circumference = 2 * Math.PI * 54
    const dashoffset = circumference * (1 - pct / 100)
    return (
      <div className={motion.riseIn} style={{ minHeight: '100dvh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div className="glass-card" style={{ width: '100%', maxWidth: 380, flexDirection: 'column', padding: '36px 28px', textAlign: 'center' as const }}>

          <div style={{ position: 'relative' as const, width: 132, height: 132, margin: '0 auto 20px' }}>
            <svg width="132" height="132" viewBox="0 0 132 132" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="66" cy="66" r="54" fill="none" stroke="var(--glass-border)" strokeWidth="10" />
              <circle cx="66" cy="66" r="54" fill="none" stroke={resultColor} strokeWidth="10" strokeLinecap="round"
                strokeDasharray={circumference} strokeDashoffset={dashoffset}
                style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '1.7rem', fontWeight: 800, color: resultColor }}>{pct}%</span>
              {pct >= 70 ? <PartyPopperIcon size={26} color={resultColor} />
                : pct >= 50 ? <CheckCircleIcon size={24} color={resultColor} />
                : <BookOpenIcon size={24} color={resultColor} />}
            </div>
          </div>

          <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px' }}>
            {pct >= 70 ? 'Excellent!' : pct >= 50 ? 'Good effort!' : 'Keep studying!'}
          </h1>
          <p style={{ fontSize: '1rem', fontWeight: 700, color: resultColor, margin: '0 0 4px' }}>
            {result.score}/{result.maxScore} points
          </p>
          {result.passed !== null && (
            <p style={{ fontSize: '0.78rem', fontWeight: 700, color: result.passed ? 'var(--success)' : 'var(--danger)', margin: '0 0 4px' }}>
              {result.passed ? 'Pass' : 'Below pass mark'}
            </p>
          )}

          {error && (
            <p style={{ fontSize: '0.75rem', color: 'var(--warning)', marginTop: 12, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
              <AlertIcon size={13} color="var(--warning)" /> {error}
            </p>
          )}

          <button onClick={() => router.push('/dashboard/student/quizzes')} className={`btn btn-primary ${motion.pressable}`}
            style={{ width: '100%', height: 48, borderRadius: 14, fontSize: '0.92rem', marginTop: 20 }}>
            Back to Quizzes
          </button>
        </div>
      </div>
    )
  }

  // ── Quiz-taking screen ────────────────────────────────────
  const timerColor = timeLeft < 60 ? 'var(--danger)' : timeLeft < 180 ? 'var(--warning)' : sc
  const SaveIndicator = () => {
    if (saveStatus === 'saving') return <><RefreshIcon size={11} color="var(--text-faint)" /> Saving...</>
    if (saveStatus === 'saved')  return <><SaveIcon size={11} color="var(--success)" /> Saved</>
    if (saveStatus === 'offline') return <><WifiOffIcon size={11} color="var(--warning)" /> Offline — retrying</>
    return null
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column' }}>

      <header style={{ position: 'sticky' as const, top: 0, zIndex: 10, background: 'var(--bg-base)', borderBottom: '1px solid var(--glass-border)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} className={motion.pressable}
          style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <ArrowLeftIcon size={16} color="var(--text-secondary)" />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{quiz?.title}</p>
          <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {answered}/{questions.length} answered
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 4 }}><SaveIndicator /></span>
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 999, border: `1px solid ${timerColor}40`, color: timerColor, fontWeight: 700, fontSize: '0.8rem', flexShrink: 0 }}>
          <ClockIcon size={13} color="currentColor" />
          {formatTime(timeLeft)}
        </div>
      </header>

      <div style={{ height: 3, background: 'var(--glass-border)' }}>
        <div style={{ height: '100%', width: `${((current + 1) / questions.length) * 100}%`, background: sc, transition: 'width 0.3s ease' }} />
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'var(--danger-subtle)', borderBottom: '1px solid rgba(239,68,68,0.3)' }}>
          <AlertIcon size={14} color="var(--danger)" />
          <span style={{ fontSize: '0.75rem', color: 'var(--danger)', flex: 1 }}>{error}</span>
          <button onClick={() => setError(null)} className={motion.pressable}
            style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', display: 'flex', padding: 2 }}><XIcon size={13} /></button>
        </div>
      )}

      {q && (
        <div className={motion.riseIn} style={{ flex: 1, padding: '24px 16px', display: 'flex', flexDirection: 'column' }} key={q.id}>
          <span style={{ fontSize: '0.7rem', fontWeight: 800, color: sc, letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 10 }}>
            Question {current + 1} of {questions.length}
          </span>
          <p style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4, marginBottom: 24 }}>
            {q.text}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(q.options ?? []).map(opt => {
              const selected = answers[q.id] === opt.label
              return (
                <button key={opt.label}
                  onClick={() => queueAnswer(q.id, opt.label)}
                  className={motion.pressable}
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

      <div style={{ position: 'sticky' as const, bottom: 0, background: 'var(--bg-base)', borderTop: '1px solid var(--glass-border)', padding: '12px 16px calc(12px + env(safe-area-inset-bottom))', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button disabled={current === 0} onClick={() => setCurrent(c => c - 1)} className={motion.pressable}
          style={{ height: 44, padding: '0 16px', borderRadius: 12, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: current === 0 ? 'var(--text-faint)' : 'var(--text-secondary)', fontWeight: 700, fontSize: '0.85rem', cursor: current === 0 ? 'default' : 'pointer' }}>
          ← Prev
        </button>

        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 5, overflowX: 'auto' as const }}>
          {questions.map((_, i) => {
            const isCurrent = i === current
            const isAnswered = !!answers[questions[i]?.id]
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
          ? <button onClick={() => setCurrent(c => c + 1)} className={motion.pressable}
              style={{ height: 44, padding: '0 20px', borderRadius: 12, background: sc, color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
              Next →
            </button>
          : <button onClick={() => setShowConfirm(true)} disabled={submitting} className={motion.pressable}
              style={{ height: 44, padding: '0 20px', borderRadius: 12, background: 'var(--success)', color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', opacity: submitting ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              {submitting ? '...' : <>Submit <CheckCircleIcon size={14} color="#fff" /></>}
            </button>
        }
      </div>

      {/* ── Submission confirmation summary (§14) ──────────────────── */}
      {showConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 30 }}
          onClick={() => setShowConfirm(false)}>
          <div className={`glass-card ${motion.riseIn}`} onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 420, flexDirection: 'column', padding: '24px 20px calc(20px + env(safe-area-inset-bottom))', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>Submit examination?</h2>
            <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              You have answered {answered} of {questions.length} questions.
              {unanswered > 0 ? ` ${unanswered} question${unanswered === 1 ? ' is' : 's are'} unanswered.` : ' All questions are answered.'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 10, marginBottom: 18, fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Time remaining</span>
              <span style={{ fontWeight: 700, color: timerColor }}>{formatTime(timeLeft)}</span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowConfirm(false)} className={motion.pressable}
                style={{ flex: 1, height: 46, borderRadius: 12, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                Keep Working
              </button>
              <button onClick={() => handleSubmit(false)} disabled={submitting} className={motion.pressable}
                style={{ flex: 1, height: 46, borderRadius: 12, background: 'var(--success)', color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>
                {submitting ? 'Submitting...' : 'Submit Examination'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
