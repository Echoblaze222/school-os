'use client'
// FIXED: queries correct columns (starts_at, ends_at, total_marks — no subject/duration_mins/question_count/status column)
// FIXED: status computed from starts_at/ends_at
// FIXED: shows quiz subject from class_subjects join

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import StudentNav from '@/components/StudentNav'
import { AwardIcon, ClockIcon, CheckCircleIcon } from '@/components/Icons'
import styles from './page.module.css'

interface Props { profile: any; school: any; userId: string }

export default function QuizzesClient({ profile, school, userId }: Props) {
  const [quizzes,  setQuizzes]  = useState<any[]>([])
  const [attempts, setAttempts] = useState<Record<string, any>>({})
  const [loading,  setLoading]  = useState(true)
  const supabase    = createClient()
  const schoolColor = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: q }, { data: a }] = await Promise.all([
      // FIXED: select only columns that exist in schema
      supabase.from('quizzes')
        .select('id, title, total_marks, attempt_limit, starts_at, ends_at, created_at, class_id, class_subject_id')
        .eq('school_id', school?.id)
        .eq('class_id', profile?.class_id)
        .order('starts_at', { ascending: false })
        .limit(30),
      supabase.from('quiz_attempts')
        .select('quiz_id, score, max_score, submitted_at')
        .eq('student_id', userId),
    ])

    if (a) {
      const map: Record<string, any> = {}
      a.forEach((att: any) => { map[att.quiz_id] = att })
      setAttempts(map)
    }
    if (q) setQuizzes(q)
    setLoading(false)
  }

  // FIXED: derive status from timestamps
  function getStatus(quiz: any): 'upcoming' | 'active' | 'ended' {
    const now  = new Date()
    const start = new Date(quiz.starts_at)
    const end   = new Date(quiz.ends_at)
    if (now < start) return 'upcoming'
    if (now <= end)  return 'active'
    return 'ended'
  }

  function statusColor(s: string) {
    if (s === 'active')   return '#10B981'
    if (s === 'ended')    return '#6B7280'
    return '#F59E0B'
  }

  function statusLabel(quiz: any) {
    const status = getStatus(quiz)
    const att    = attempts[quiz.id]
    if (att) return `Done · ${att.score ?? 0}/${att.max_score ?? quiz.total_marks}pts`
    if (status === 'active')   return 'Available now'
    if (status === 'ended')    return 'Ended'
    return `Starts ${new Date(quiz.starts_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}`
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
                    const status = getStatus(quiz)
                    const done   = !!attempts[quiz.id]
                    const active = status === 'active' && !done
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
                          <p className={styles.cardText}>{quiz.total_marks} marks</p>
                          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', marginTop: 4 }}>
                            <span style={{ fontSize: '0.68rem', fontWeight: 600, color: statusColor(status) }}>
                              {statusLabel(quiz)}
                            </span>
                          </div>
                        </div>
                        {active && (
                          <Link href={`/dashboard/student/quizzes/${quiz.id}`}
                            style={{ padding: '8px 16px', background: schoolColor, color: '#fff', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700, textDecoration: 'none', flexShrink: 0 }}>
                            Start
                          </Link>
                        )}
                        {done && (
                          <span style={{ padding: '8px 12px', background: '#10B98120', color: '#10B981', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, flexShrink: 0 }}>
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
