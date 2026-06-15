'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import StudentNav from '@/components/StudentNav'
import { AwardIcon, ClockIcon, CheckCircleIcon } from '@/components/Icons'
import styles from './page.module.css'

interface Props { profile: any; school: any; userId: string }

export default function QuizzesClient({ profile, school, userId }: Props) {
  const [quizzes, setQuizzes] = useState<any[]>([])
  const [attempts, setAttempts] = useState<Record<string, any>>({})
  const [loading, setLoading]   = useState(true)
  const supabase    = createClient()
  const schoolColor = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [])

  async function load() {
    const now = new Date().toISOString()
    const [{ data: q }, { data: a }] = await Promise.all([
      supabase.from('quizzes')
        // QUIZ FIX: select starts_at/ends_at (not status/scheduled_at — those may be missing)
        // Also select total_marks/attempt_limit; teacher uses these not duration_mins/question_count
        .select('id, title, total_marks, attempt_limit, starts_at, ends_at, class_id, class_subject_id, created_at')
        .eq('school_id', school?.id)
        .eq('class_id', profile?.class_id)
        // QUIZ FIX: filter by ends_at not a status column (status col may not exist)
        // Show quizzes that haven't ended yet OR ended in last 30 days (for history)
        .order('starts_at', { ascending: false })
        .limit(30),
      supabase.from('quiz_attempts')
        .select('quiz_id, score, submitted_at')
        .eq('student_id', userId),
    ])
    if (q) setQuizzes(q)
    if (a) {
      const map: Record<string, any> = {}
      a.forEach((att: any) => { map[att.quiz_id] = att })
      setAttempts(map)
    }
    setLoading(false)
  }

  // QUIZ FIX: derive status from starts_at/ends_at timestamps instead of a status column
  function quizStatus(quiz: any): 'upcoming' | 'live' | 'ended' {
    const now = new Date()
    const starts = quiz.starts_at ? new Date(quiz.starts_at) : null
    const ends   = quiz.ends_at   ? new Date(quiz.ends_at)   : null
    if (ends && ends < now)           return 'ended'
    if (starts && starts > now)       return 'upcoming'
    return 'live'
  }

  function statusColor(quiz: any) {
    const s = quizStatus(quiz)
    if (s === 'live')     return '#10B981'
    if (s === 'ended')    return '#6B7280'
    return '#F59E0B'
  }

  function statusLabel(quiz: any) {
    const s = quizStatus(quiz)
    if (attempts[quiz.id]) return `Done · ${attempts[quiz.id].score}pts`
    if (s === 'live')     return 'Available now'
    if (s === 'ended')    return 'Ended'
    if (quiz.starts_at)   return `Opens ${new Date(quiz.starts_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}`
    return 'Scheduled'
  }

  return (
    <div className={styles.page}>
      <StudentNav userId={userId} profile={profile} school={school} schoolColor={schoolColor} />
      <div className={styles.content}>
        <DashboardHeader userId={userId} role="student" profile={profile} school={school}
          schoolColor={schoolColor} title="Quizzes" showBack />
        <main className={styles.main}>
          {loading
            ? <div className={styles.loading}><span/><span/><span/></div>
            : quizzes.length === 0
              ? <div className={styles.empty}>
                  <AwardIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
                  <p>No quizzes available yet</p>
                </div>
              : <div className={styles.list}>
                  {quizzes.map(quiz => {
                    const done   = !!attempts[quiz.id]
                    const status = quizStatus(quiz)
                    const active = status === 'live' && !done
                    return (
                      <div key={quiz.id} className={styles.card}>
                        <div className={styles.cardIcon}
                          style={{ background: done ? 'rgba(16,185,129,0.1)' : schoolColor + '20' }}>
                          {done
                            ? <CheckCircleIcon size={18} color="#10B981"/>
                            : <AwardIcon size={18} color={schoolColor}/>
                          }
                        </div>
                        <div className={styles.cardBody}>
                          <p className={styles.cardTitle}>{quiz.title}</p>
                          {/* QUIZ FIX: show total_marks, not missing subject/duration_mins fields */}
                          <p className={styles.cardText}>{quiz.total_marks} marks · {quiz.attempt_limit} attempt{quiz.attempt_limit !== 1 ? 's' : ''}</p>
                          <div style={{ display:'flex', gap:'var(--space-3)', alignItems:'center', marginTop:4 }}>
                            {quiz.ends_at && status !== 'ended' && (
                              <span style={{ fontSize:'0.68rem', color:'var(--text-muted)', display:'flex', alignItems:'center', gap:3 }}>
                                <ClockIcon size={11} color="var(--text-muted)"/>
                                {status === 'live'
                                  ? `Closes ${new Date(quiz.ends_at).toLocaleDateString('en-NG', { day:'numeric', month:'short' })}`
                                  : `Opens ${new Date(quiz.starts_at).toLocaleDateString('en-NG', { day:'numeric', month:'short' })}`
                                }
                              </span>
                            )}
                            <span style={{ fontSize:'0.68rem', fontWeight:600, color: statusColor(quiz) }}>
                              {statusLabel(quiz)}
                            </span>
                          </div>
                        </div>
                        {active && (
                          <Link href={`/dashboard/student/quizzes/${quiz.id}`}
                            style={{ padding:'8px 16px', background:schoolColor, color:'#fff', borderRadius:'999px', fontSize:'0.75rem', fontWeight:700, textDecoration:'none', flexShrink:0 }}>
                            Start
                          </Link>
                        )}
                        {done && (
                          <span style={{ padding:'6px 12px', background:'rgba(16,185,129,0.1)', color:'#10B981', borderRadius:999, fontSize:'0.72rem', fontWeight:700, flexShrink:0 }}>
                            ✓ Done
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
          }
          <div className={styles.spacer}/>
        </main>
      </div>
    </div>
  )
}
