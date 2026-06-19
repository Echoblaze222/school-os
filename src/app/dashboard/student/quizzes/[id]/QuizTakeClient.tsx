'use client'
// FIXED (schema-accurate):
// - quiz_questions: reads "question" col (text), "options" jsonb [{label,text}], "answer" (letter), "marks", "position"
// - quiz_attempts: NO unique constraint → check for existing attempt first, then INSERT (not upsert)
// - timer: uses quiz.duration_mins (column exists on quizzes table)
// - score: compares chosen letter against answer letter

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ClockIcon, ArrowLeftIcon } from '@/components/Icons'
import styles from './quiz-take.module.css'

interface DbQuestion {
  id: string
  question: string                           // the question text (teacher writes to "question" col)
  options: { label: string; text: string }[] // [{label:'A',text:'...'}, ...]
  answer: string                             // 'A' | 'B' | 'C' | 'D'
  marks: number
  position: number
}

interface Props {
  quizId: string; userId: string; profile: any; school: any
}

export default function QuizTakeClient({ quizId, userId, profile, school }: Props) {
  const [quiz,       setQuiz]       = useState<any>(null)
  const [questions,  setQuestions]  = useState<DbQuestion[]>([])
  const [answers,    setAnswers]    = useState<Record<string, string>>({}) // questionId -> letter e.g. 'A'
  const [current,    setCurrent]    = useState(0)
  const [timeLeft,   setTimeLeft]   = useState(0)
  const [submitted,  setSubmitted]  = useState(false)
  const [alreadyDone, setAlreadyDone] = useState(false)
  const [priorScore, setPriorScore] = useState<{ score: number; max: number } | null>(null)
  const [score,      setScore]      = useState(0)
  const [loading,    setLoading]    = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const router      = useRouter()
  const supabase    = createClient()
  const timerRef    = useRef<NodeJS.Timeout | null>(null)
  const schoolColor = school?.primary_color ?? '#7C3AED'

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
    const [{ data: q }, { data: qs }, { data: existing }] = await Promise.all([
      supabase.from('quizzes').select('*').eq('id', quizId).single(),
      // Reads the columns the teacher writes to
      supabase.from('quiz_questions')
        .select('id, question, options, answer, marks, position')
        .eq('quiz_id', quizId)
        .order('position', { ascending: true }),
      // FIXED: check for existing attempt (no unique constraint, so just query)
      supabase.from('quiz_attempts')
        .select('score, max_score')
        .eq('quiz_id', quizId)
        .eq('student_id', userId)
        .maybeSingle(),
    ])

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

    // Score: compare chosen letter against stored answer letter
    let total = 0
    questions.forEach(q => {
      if (answers[q.id] === q.answer) total += (q.marks ?? 1)
    })
    setScore(total)

    const maxScore = questions.reduce((s, q) => s + (q.marks ?? 1), 0)

    // FIXED: NO unique constraint on quiz_attempts → always INSERT
    await supabase.from('quiz_attempts').insert({
      quiz_id:      quizId,
      student_id:   userId,
      school_id:    school?.id,
      answers,
      score:        total,
      max_score:    maxScore,
      submitted_at: new Date().toISOString(),
    })

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

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', background: 'var(--bg-base)' }}>
      <div className={styles.dots}><span/><span/><span/></div>
    </div>
  )

  // Already attempted
  if (alreadyDone && !submitted) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', gap: 16, background: 'var(--bg-base)', padding: 24 }}>
      <p style={{ fontSize: '2.5rem' }}>✅</p>
      <p style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1.1rem' }}>Already submitted</p>
      {priorScore && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Your score: <strong style={{ color: schoolColor }}>{priorScore.score}/{priorScore.max}</strong>
          {' '}({Math.round((priorScore.score / (priorScore.max || 1)) * 100)}%)
        </p>
      )}
      <button onClick={() => router.push('/dashboard/student/quizzes')}
        style={{ padding: '10px 24px', background: schoolColor, color: '#fff', border: 'none', borderRadius: 999, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
        Back to Quizzes
      </button>
    </div>
  )

  // No questions saved yet
  if (questions.length === 0) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', gap: 16, background: 'var(--bg-base)', padding: 24 }}>
      <p style={{ fontSize: '2rem' }}>📭</p>
      <p style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem' }}>No questions yet</p>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
        The teacher hasn't added questions to this quiz yet. Check back soon.
      </p>
      <button onClick={() => router.push('/dashboard/student/quizzes')}
        style={{ padding: '10px 24px', background: schoolColor, color: '#fff', border: 'none', borderRadius: 999, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
        Back to Quizzes
      </button>
    </div>
  )

  // Results screen
  if (submitted) return (
    <div className={styles.results}>
      <div className={styles.resultsCard}>
        <div className={styles.resultsBadge} style={{ background: pct >= 70 ? '#10B981' : pct >= 50 ? '#F59E0B' : '#EF4444' }}>
          {pct >= 70 ? '🎉' : pct >= 50 ? '👍' : '📚'}
        </div>
        <h1 className={styles.resultsTitle}>{pct >= 70 ? 'Excellent!' : pct >= 50 ? 'Good effort!' : 'Keep studying!'}</h1>
        <p className={styles.resultsScore} style={{ color: pct >= 70 ? '#10B981' : pct >= 50 ? '#F59E0B' : '#EF4444' }}>
          {score}/{maxScore} points
        </p>
        <p className={styles.resultsPct}>{pct}%</p>
        <div className={styles.resultsBar}>
          <div className={styles.resultsBarFill}
            style={{ width: `${pct}%`, background: pct >= 70 ? '#10B981' : pct >= 50 ? '#F59E0B' : '#EF4444' }}/>
        </div>
        <p className={styles.resultsSub}>{answered} of {questions.length} questions answered</p>
        <button className={styles.doneBtn} style={{ background: schoolColor }}
          onClick={() => router.push('/dashboard/student/quizzes')}>
          Back to Quizzes
        </button>
      </div>
    </div>
  )

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.back()}>
          <ArrowLeftIcon size={18}/>
        </button>
        <div className={styles.quizInfo}>
          <p className={styles.quizTitle}>{quiz?.title}</p>
          <p className={styles.quizSub}>{answered}/{questions.length} answered</p>
        </div>
        <div className={styles.timer}
          style={{ color: timeLeft < 60 ? '#EF4444' : timeLeft < 180 ? '#F59E0B' : schoolColor,
                   borderColor: timeLeft < 60 ? '#EF4444' : timeLeft < 180 ? '#F59E0B' : schoolColor + '40' }}>
          <ClockIcon size={14} color="currentColor"/>
          {formatTime(timeLeft)}
        </div>
      </header>

      <div className={styles.progressTrack}>
        <div className={styles.progressFill}
          style={{ width: `${((current + 1) / questions.length) * 100}%`, background: schoolColor }}/>
      </div>

      {q && (
        <div className={styles.questionWrap}>
          <p className={styles.qNum}>Question {current + 1} of {questions.length}</p>
          <p className={styles.qText}>{q.question}</p>
          <div className={styles.options}>
            {(q.options ?? []).map((opt) => (
              <button key={opt.label}
                className={`${styles.option} ${answers[q.id] === opt.label ? styles.optionSelected : ''}`}
                style={answers[q.id] === opt.label ? { borderColor: schoolColor, background: schoolColor + '18' } : {}}
                onClick={() => setAnswers(prev => ({ ...prev, [q.id]: opt.label }))}>
                <span className={styles.optLetter}
                  style={answers[q.id] === opt.label ? { background: schoolColor, color: '#fff' } : {}}>
                  {opt.label}
                </span>
                <span className={styles.optText}>{opt.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={styles.navBar}>
        <button className={styles.navBtn} disabled={current === 0} onClick={() => setCurrent(c => c - 1)}>
          ← Prev
        </button>
        <div className={styles.dotNav}>
          {questions.map((_, i) => (
            <button key={i}
              className={`${styles.dot} ${i === current ? styles.dotCurrent : ''} ${answers[questions[i]?.id] !== undefined ? styles.dotAnswered : ''}`}
              style={i === current ? { background: schoolColor } : answers[questions[i]?.id] !== undefined ? { background: schoolColor + '60' } : {}}
              onClick={() => setCurrent(i)}/>
          ))}
        </div>
        {current < questions.length - 1
          ? <button className={styles.navBtn} style={{ background: schoolColor, color: '#fff', border: 'none' }}
              onClick={() => setCurrent(c => c + 1)}>Next →</button>
          : <button className={styles.submitBtn} style={{ background: schoolColor }}
              onClick={handleSubmit} disabled={submitting}>
              {submitting ? '...' : 'Submit ✓'}
            </button>
        }
      </div>
    </div>
  )
}
