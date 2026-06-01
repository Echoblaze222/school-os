'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ClockIcon, CheckCircleIcon, ArrowLeftIcon } from '@/components/Icons'
import styles from './quiz-take.module.css'

interface Question {
  id: string; text: string; options: string[]; points: number
}
interface Props {
  quizId: string; userId: string; profile: any; school: any
}

export default function QuizTakeClient({ quizId, userId, profile, school }: Props) {
  const [quiz,        setQuiz]        = useState<any>(null)
  const [questions,   setQuestions]   = useState<Question[]>([])
  const [answers,     setAnswers]     = useState<Record<string, number>>({})
  const [current,     setCurrent]     = useState(0)
  const [timeLeft,    setTimeLeft]    = useState(0)
  const [submitted,   setSubmitted]   = useState(false)
  const [score,       setScore]       = useState(0)
  const [loading,     setLoading]     = useState(true)
  const [submitting,  setSubmitting]  = useState(false)
  const router      = useRouter()
  const supabase    = createClient()
  const timerRef    = useRef<NodeJS.Timeout | null>(null)
  const schoolColor = school?.primary_color ?? '#7C3AED'

  useEffect(() => { loadQuiz() }, [quizId])

  useEffect(() => {
    if (!quiz || submitted) return
    setTimeLeft(quiz.duration_mins * 60)
  }, [quiz])

  useEffect(() => {
    if (timeLeft <= 0 || submitted) return
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current!); handleSubmit(); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current!)
  }, [timeLeft, submitted])

  async function loadQuiz() {
    const [{ data: q }, { data: qs }] = await Promise.all([
      supabase.from('quizzes').select('*').eq('id', quizId).single(),
      supabase.from('quiz_questions').select('id, text, options, correct_option, points')
        .eq('quiz_id', quizId).order('order', { ascending: true }),
    ])
    if (q)  setQuiz(q)
    if (qs) setQuestions(qs as Question[])
    setLoading(false)
  }

  const handleSubmit = useCallback(async () => {
    if (submitting || submitted) return
    setSubmitting(true)
    clearInterval(timerRef.current!)

    // Calculate score
    let total = 0
    questions.forEach((q: any) => {
      if (answers[q.id] === q.correct_option) total += (q.points ?? 1)
    })
    setScore(total)

    const maxScore = questions.reduce((s: number, q: any) => s + (q.points ?? 1), 0)
    await supabase.from('quiz_attempts').upsert({
      quiz_id:     quizId,
      student_id:  userId,
      school_id:   school?.id,
      answers,
      score:       total,
      max_score:   maxScore,
      submitted_at: new Date().toISOString(),
    }, { onConflict: 'quiz_id,student_id' })

    setSubmitted(true)
    setSubmitting(false)
  }, [answers, questions, submitted, submitting])

  function formatTime(s: number) {
    const m = Math.floor(s / 60).toString().padStart(2, '0')
    const sec = (s % 60).toString().padStart(2, '0')
    return `${m}:${sec}`
  }

  const maxScore  = questions.reduce((s: number, q: any) => s + (q.points ?? 1), 0)
  const answered  = Object.keys(answers).length
  const pct       = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0
  const q         = questions[current]

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100dvh', background:'var(--bg-base)' }}>
      <div className={styles.dots}><span/><span/><span/></div>
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
            style={{ width:`${pct}%`, background: pct >= 70 ? '#10B981' : pct >= 50 ? '#F59E0B' : '#EF4444' }}/>
        </div>
        <p className={styles.resultsSub}>
          {answered} of {questions.length} questions answered
        </p>
        <button className={styles.doneBtn} style={{ background: schoolColor }}
          onClick={() => router.push('/dashboard/student/quizzes')}>
          Back to Quizzes
        </button>
      </div>
    </div>
  )

  return (
    <div className={styles.page}>
      {/* Header */}
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

      {/* Progress bar */}
      <div className={styles.progressTrack}>
        <div className={styles.progressFill}
          style={{ width:`${((current + 1) / questions.length) * 100}%`, background: schoolColor }}/>
      </div>

      {/* Question */}
      {q && (
        <div className={styles.questionWrap}>
          <p className={styles.qNum}>Question {current + 1} of {questions.length}</p>
          <p className={styles.qText}>{q.text}</p>

          <div className={styles.options}>
            {q.options.map((opt: string, i: number) => (
              <button key={i}
                className={`${styles.option} ${answers[q.id] === i ? styles.optionSelected : ''}`}
                style={answers[q.id] === i ? { borderColor: schoolColor, background: schoolColor + '18' } : {}}
                onClick={() => setAnswers(prev => ({ ...prev, [q.id]: i }))}>
                <span className={styles.optLetter}
                  style={answers[q.id] === i ? { background: schoolColor, color:'#fff' } : {}}>
                  {String.fromCharCode(65 + i)}
                </span>
                <span className={styles.optText}>{opt}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className={styles.navBar}>
        <button className={styles.navBtn}
          disabled={current === 0}
          onClick={() => setCurrent(c => c - 1)}>
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
          ? <button className={styles.navBtn} style={{ background: schoolColor, color:'#fff', border:'none' }}
              onClick={() => setCurrent(c => c + 1)}>
              Next →
            </button>
          : <button className={styles.submitBtn} style={{ background: schoolColor }}
              onClick={handleSubmit} disabled={submitting}>
              {submitting ? '...' : 'Submit ✓'}
            </button>
        }
      </div>
    </div>
  )
}
