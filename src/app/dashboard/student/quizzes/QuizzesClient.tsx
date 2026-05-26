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
    const [{ data: q }, { data: a }] = await Promise.all([
      supabase.from('quizzes')
        .select('id, title, subject, duration_mins, question_count, scheduled_at, status')
        .eq('school_id', school?.id)
        .order('scheduled_at', { ascending: false })
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

  function statusColor(s: string) {
    if (s === 'active') return '#10B981'
    if (s === 'ended')  return '#6B7280'
    return '#F59E0B'
  }

  function statusLabel(q: any) {
    if (attempts[q.id]) return `Done · ${attempts[q.id].score}pts`
    if (q.status === 'active') return 'Available now'
    if (q.status === 'ended')  return 'Ended'
    return `Starts ${new Date(q.scheduled_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}`
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
                    const active = quiz.status === 'active' && !done
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
                          <p className={styles.cardText}>{quiz.subject}</p>
                          <div style={{ display:'flex', gap:'var(--space-3)', alignItems:'center', marginTop:4 }}>
                            <span style={{ fontSize:'0.68rem', color:'var(--text-muted)', display:'flex', alignItems:'center', gap:3 }}>
                              <ClockIcon size={11} color="var(--text-muted)"/> {quiz.duration_mins}min
                            </span>
                            <span style={{ fontSize:'0.68rem', fontWeight:600, color: statusColor(quiz.status) }}>
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
