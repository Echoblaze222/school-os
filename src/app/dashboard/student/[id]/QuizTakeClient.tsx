'use client'

// src/app/dashboard/student/quizzes/[id]/QuizTakeClient.tsx

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import styles from './quiz-take.module.css'
import type { QuizDetail, QuizQuestion, ExistingAttempt } from './page'

interface Props {
  quiz: QuizDetail
  questions: QuizQuestion[]
  existingAttempt: ExistingAttempt | null
  studentId: string
}

type Screen = 'intro' | 'taking' | 'results'

/* ── Helpers ─────────────────────────────────────────────── */
function formatTimer(secs: number) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function scoreColor(pct: number) {
  if (pct >= 70) return { ring: 'var(--success)', bg: 'var(--success-bg)', text: 'var(--success)', label: 'Excellent' }
  if (pct >= 50) return { ring: 'var(--warning)', bg: 'var(--warning-bg)', text: 'var(--warning)', label: 'Average' }
  return              { ring: 'var(--error)',   bg: 'var(--error-bg)',   text: 'var(--error)',   label: 'Below Pass' }
}

/* ── Results Screen ─────────────────────────────────────── */
function ResultsScreen({
  quiz,
  questions,
  answers,
  timeTaken,
  onRetake,
}: {
  quiz: QuizDetail
  questions: QuizQuestion[]
  answers: number[]
  timeTaken: number
  onRetake: () => void
}) {
  const router = useRouter()
  const correct = questions.reduce((sum, q, i) => sum + (answers[i] === q.correct_option ? 1 : 0), 0)
  const pct     = Math.round((correct / questions.length) * 100)
  const sc      = scoreColor(pct)

  const circumference = 2 * Math.PI * 42
  const dashOffset    = circumference - (circumference * pct) / 100

  return (
    <div className={styles.resultsPage}>
      <div className={`burgundy-glow-orb ${styles.resultsOrb}`} aria-hidden />

      {/* Score ring */}
      <div className={styles.scoreSection}>
        <div className={styles.scoreRingWrap}>
          <svg className={styles.scoreRing} viewBox="0 0 100 100" aria-hidden>
            <circle className={styles.ringBg}   cx="50" cy="50" r="42" />
            <circle
              className={styles.ringFill}
              cx="50" cy="50" r="42"
              stroke={sc.ring}
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
            />
          </svg>
          <div className={styles.scoreCenter}>
            <span className={styles.scorePct} style={{ color: sc.text }}>{pct}%</span>
            <span className={styles.scoreFraction}>{correct}/{questions.length}</span>
          </div>
        </div>

        <span className={styles.scoreVerdict} style={{ background: sc.bg, color: sc.text }}>
          {sc.label}
        </span>

        <h2 className={styles.resultsTitle}>{quiz.title}</h2>

        <div className={styles.resultsMeta}>
          <span className={styles.resultsMetaItem}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            {formatTimer(timeTaken)} taken
          </span>
          <span>·</span>
          <span className={styles.resultsMetaItem}>{quiz.subject}</span>
        </div>
      </div>

      {/* Question breakdown */}
      <div className={styles.breakdownSection}>
        <h3 className={styles.breakdownTitle}>Review</h3>
        <div className={styles.breakdownList}>
          {questions.map((q, i) => {
            const isCorrect = answers[i] === q.correct_option
            const studentAns = answers[i]
            return (
              <div
                key={q.id}
                className={`${styles.reviewItem} ${isCorrect ? styles.reviewCorrect : styles.reviewWrong}`}
              >
                <div className={styles.reviewHeader}>
                  <span className={styles.reviewNum}>Q{i + 1}</span>
                  <div className={styles.reviewIcon}>
                    {isCorrect ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    )}
                  </div>
                  <span className={styles.reviewQuestion}>{q.question_text}</span>
                </div>
                {!isCorrect && (
                  <div className={styles.reviewAnswers}>
                    {studentAns !== undefined && (
                      <div className={styles.reviewWrongAns}>
                        <span className={styles.reviewAnsLabel}>Your answer:</span>
                        <span>{q.options[studentAns] ?? '—'}</span>
                      </div>
                    )}
                    <div className={styles.reviewCorrectAns}>
                      <span className={styles.reviewAnsLabel}>Correct:</span>
                      <span>{q.options[q.correct_option]}</span>
                    </div>
                  </div>
                )}
                {q.explanation && (
                  <p className={styles.reviewExplanation}>{q.explanation}</p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Actions */}
      <div className={styles.resultsActions}>
        <button className="btn btn-primary" onClick={onRetake}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
          </svg>
          Retake Quiz
        </button>
        <button className="btn btn-ghost" onClick={() => router.push('/dashboard/student/quizzes')}>
          Back to Quizzes
        </button>
      </div>
    </div>
  )
}

/* ── Main Component ─────────────────────────────────────── */
export default function QuizTakeClient({ quiz, questions, existingAttempt, studentId }: Props) {
  const router = useRouter()

  const [screen, setScreen] = useState<Screen>(existingAttempt ? 'results' : 'intro')
  const [currentQ, setCurrentQ]   = useState(0)
  const [answers, setAnswers]      = useState<number[]>(
    existingAttempt ? existingAttempt.answers : Array(questions.length).fill(-1)
  )
  const [selected, setSelected]    = useState<number>(-1)  // current question's temp pick
  const [revealed, setRevealed]    = useState(false)        // show correct/wrong instantly (false = reveal on submit only)
  const [timeLeft, setTimeLeft]    = useState(quiz.duration_minutes * 60)
  const [timeTaken, setTimeTaken]  = useState(existingAttempt?.time_taken_seconds ?? 0)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [transition, setTransition] = useState(false)

  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTime = useRef<number>(Date.now())

  useEffect(() => {
    const theme = localStorage.getItem('schoolos_theme') ?? 'dark'
    document.documentElement.setAttribute('data-theme', theme)
  }, [])

  // Sync selected when navigating questions
  useEffect(() => {
    setSelected(answers[currentQ] ?? -1)
  }, [currentQ, answers])

  // Timer — only runs during 'taking' screen
  useEffect(() => {
    if (screen !== 'taking') return
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          handleSubmit(true) // auto-submit on timeout
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current!)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen])

  const handleStartQuiz = () => {
    startTime.current = Date.now()
    setAnswers(Array(questions.length).fill(-1))
    setCurrentQ(0)
    setSelected(-1)
    setTimeLeft(quiz.duration_minutes * 60)
    setScreen('taking')
  }

  const handleSelect = (optionIdx: number) => {
    if (submitting) return
    setSelected(optionIdx)
    const updated = [...answers]
    updated[currentQ] = optionIdx
    setAnswers(updated)
  }

  const goToQuestion = (idx: number) => {
    setTransition(true)
    setTimeout(() => {
      setCurrentQ(idx)
      setTransition(false)
    }, 180)
  }

  const handleNext = () => {
    if (currentQ < questions.length - 1) goToQuestion(currentQ + 1)
  }

  const handlePrev = () => {
    if (currentQ > 0) goToQuestion(currentQ - 1)
  }

  const handleSubmit = useCallback(async (autoSubmit = false) => {
    clearInterval(timerRef.current!)
    const elapsed = Math.round((Date.now() - startTime.current) / 1000)
    setTimeTaken(elapsed)
    setSubmitting(true)
    setSubmitError('')

    const finalAnswers = autoSubmit ? [...answers] : [...answers]
    const supabase = createClient()
    const correct = questions.reduce(
      (sum, q, i) => sum + (finalAnswers[i] === q.correct_option ? 1 : 0), 0
    )

    const { error } = await supabase.from('quiz_attempts').upsert({
      student_id:       studentId,
      quiz_id:          quiz.id,
      score:            correct,
      total_questions:  questions.length,
      answers:          finalAnswers,
      time_taken_seconds: elapsed,
      completed_at:     new Date().toISOString(),
    }, { onConflict: 'student_id,quiz_id' })

    if (error) {
      console.error('[quiz-submit] error:', error.message)
      setSubmitError('Failed to save results. Please check your connection.')
      setSubmitting(false)
      return
    }

    setAnswers(finalAnswers)
    setSubmitting(false)
    setScreen('results')
  }, [answers, questions, quiz.id, studentId])

  const answeredCount = answers.filter(a => a !== -1).length
  const progress = questions.length > 0 ? (answeredCount / questions.length) * 100 : 0
  const timerPct = (timeLeft / (quiz.duration_minutes * 60)) * 100
  const isTimerWarn  = timerPct < 33
  const isTimerDanger = timerPct < 10

  /* ── INTRO SCREEN ── */
  if (screen === 'intro') {
    return (
      <div className={styles.page}>
        <div className={`burgundy-glow-orb ${styles.orb1}`} aria-hidden />

        <header className={styles.header}>
          <button onClick={() => router.push('/dashboard/student/quizzes')} className={styles.backBtn} aria-label="Back">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <span className={styles.headerLabel}>Quiz Details</span>
          <div style={{ width: 38 }} />
        </header>

        <main className={styles.introMain}>
          <div className={styles.introSubject}>{quiz.subject}</div>
          <h1 className={styles.introTitle}>{quiz.title}</h1>
          {quiz.description && <p className={styles.introDesc}>{quiz.description}</p>}

          <div className={styles.introGrid}>
            <div className={`glass-card ${styles.introStat}`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--info)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
              </svg>
              <span className={styles.introStatVal}>{questions.length}</span>
              <span className={styles.introStatLbl}>Questions</span>
            </div>
            <div className={`glass-card ${styles.introStat}`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              <span className={styles.introStatVal}>{quiz.duration_minutes}</span>
              <span className={styles.introStatLbl}>Minutes</span>
            </div>
            <div className={`glass-card ${styles.introStat}`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
              </svg>
              <span className={styles.introStatVal}>MCQ</span>
              <span className={styles.introStatLbl}>Format</span>
            </div>
          </div>

          <div className={styles.introRules}>
            <h3 className={styles.introRulesTitle}>Before you begin</h3>
            <ul className={styles.introRulesList}>
              <li>The timer starts as soon as you press Start.</li>
              <li>You can navigate between questions freely.</li>
              <li>The quiz auto-submits when time runs out.</li>
              <li>You can retake this quiz after completion.</li>
            </ul>
          </div>

          {questions.length === 0 ? (
            <div className={styles.noQuestions}>
              <p>No questions have been added to this quiz yet.</p>
            </div>
          ) : (
            <button className={`btn btn-primary ${styles.startBtn}`} onClick={handleStartQuiz}>
              Start Quiz
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            </button>
          )}
        </main>
      </div>
    )
  }

  /* ── RESULTS SCREEN ── */
  if (screen === 'results') {
    return (
      <ResultsScreen
        quiz={quiz}
        questions={questions}
        answers={answers}
        timeTaken={timeTaken}
        onRetake={handleStartQuiz}
      />
    )
  }

  /* ── TAKING SCREEN ── */
  const q = questions[currentQ]
  if (!q) return null

  return (
    <div className={styles.page}>
      {/* ── Quiz Header ── */}
      <header className={styles.quizHeader}>
        <button
          className={styles.backBtn}
          onClick={() => {
            if (window.confirm('Leave quiz? Your progress will be lost.')) {
              router.push('/dashboard/student/quizzes')
            }
          }}
          aria-label="Exit quiz"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>

        <div className={styles.quizHeaderCenter}>
          <span className={styles.quizProgress}>{currentQ + 1} of {questions.length}</span>
        </div>

        {/* Timer */}
        <div
          className={`${styles.timer} ${isTimerWarn ? styles.timerWarn : ''} ${isTimerDanger ? styles.timerDanger : ''}`}
          aria-live="polite"
          aria-label={`Time remaining: ${formatTimer(timeLeft)}`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          {formatTimer(timeLeft)}
        </div>
      </header>

      {/* Progress bar */}
      <div className={styles.progressTrack}>
        <div className={styles.progressFill} style={{ width: `${progress}%` }} />
      </div>

      {/* ── Question ── */}
      <main className={styles.questionMain}>
        {/* Dot navigator */}
        <div className={styles.dotNav} role="tablist" aria-label="Question navigation">
          {questions.map((_, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === currentQ}
              aria-label={`Question ${i + 1}${answers[i] !== -1 ? ' (answered)' : ''}`}
              className={`${styles.dot} ${i === currentQ ? styles.dotActive : ''} ${answers[i] !== -1 && i !== currentQ ? styles.dotAnswered : ''}`}
              onClick={() => goToQuestion(i)}
            />
          ))}
        </div>

        {/* Question card */}
        <div className={`glass-card ${styles.questionCard} ${transition ? styles.questionOut : styles.questionIn}`}>
          <div className={styles.qNumber}>Question {currentQ + 1}</div>
          <h2 className={styles.qText}>{q.question_text}</h2>
        </div>

        {/* Options */}
        <div className={`${styles.optionsList} ${transition ? styles.questionOut : styles.questionIn}`} role="radiogroup" aria-label="Answer options">
          {q.options.map((opt, oi) => (
            <button
              key={oi}
              role="radio"
              aria-checked={selected === oi}
              className={`${styles.option} ${selected === oi ? styles.optionSelected : ''}`}
              onClick={() => handleSelect(oi)}
              disabled={submitting}
            >
              <span className={styles.optionLetter}>
                {['A', 'B', 'C', 'D', 'E'][oi]}
              </span>
              <span className={styles.optionText}>{opt}</span>
              {selected === oi && (
                <svg className={styles.optionCheck} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </button>
          ))}
        </div>

        {/* Navigation */}
        <div className={styles.navRow}>
          <button
            className={`btn btn-ghost ${styles.navBtn}`}
            onClick={handlePrev}
            disabled={currentQ === 0}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Prev
          </button>

          {currentQ < questions.length - 1 ? (
            <button className="btn btn-primary" onClick={handleNext}>
              Next
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={() => handleSubmit(false)}
              disabled={submitting}
            >
              {submitting ? <span className={styles.spinner} /> : null}
              {submitting ? 'Submitting…' : `Submit (${answeredCount}/${questions.length})`}
            </button>
          )}
        </div>

        {submitError && (
          <p className={styles.submitError}>{submitError}</p>
        )}
      </main>
    </div>
  )
}
