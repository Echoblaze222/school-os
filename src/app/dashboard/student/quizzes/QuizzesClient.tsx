'use client'
// src/app/dashboard/student/quizzes/QuizzesClient.tsx
// FIX: old file selected non-existent columns: `subject`, `question_count`,
// `status` — these don't exist on the real `quizzes` table. Real columns are:
// id, title, total_marks, attempt_limit, starts_at, ends_at, class_id.
// Status is now derived from starts_at/ends_at (same logic as teacher side).
// Also: no error handling on load — added error banner.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import StudentNav from '@/components/StudentNav'
import { AwardIcon, ClockIcon } from '@/components/Icons'
import styles from './page.module.css'

interface Props { profile: any; school: any; userId: string }

function deriveStatus(q: any): 'upcoming' | 'live' | 'ended' {
  const now = new Date()
  if (new Date(q.starts_at) > now) return 'upcoming'
  if (new Date(q.ends_at)   > now) return 'live'
  return 'ended'
}

const STATUS_COLOR = { live: '#10B981', upcoming: '#F59E0B', ended: '#6B7280' }
const STATUS_LABEL = { live: 'Available now', upcoming: 'Upcoming', ended: 'Ended' }

export default function QuizzesClient({ profile, school, userId }: Props) {
  const [quizzes,  setQuizzes]  = useState<any[]>([])
  const [attempts, setAttempts] = useState<Record<string, any>>({})
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const supabase    = createClient()
  const schoolColor = school?.primary_color ?? '#7C3AED'
  const router      = useRouter()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)

    const [
      { data: q, error: qErr },
      { data: a, error: aErr },
    ] = await Promise.all([
      // FIX: only real columns — no subject/question_count/status
      supabase.from('quizzes')
        .select('id, title, total_marks, attempt_limit, starts_at, ends_at, class_id')
        .eq('school_id', school?.id)
        .eq('class_id', profile?.class_id)
        .order('starts_at', { ascending: false })
        .limit(30),
      supabase.from('quiz_attempts')
        .select('quiz_id, score, max_score, submitted_at')
        .eq('student_id', userId),
    ])

    if (qErr) { console.error('[student quizzes] load error:', qErr.message); setError(qErr.message) }
    if (aErr)   console.error('[student quizzes] attempts error:', aErr.message)

    if (q) setQuizzes(q)
    if (a) {
      const map: Record<string, any> = {}
      a.forEach((att: any) => { map[att.quiz_id] = att })
      setAttempts(map)
    }
    setLoading(false)
  }

  function canStart(q: any) {
    const status  = deriveStatus(q)
    const attempt = attempts[q.id]
    if (status !== 'live') return false
    // Check attempt limit
    if (attempt && q.attempt_limit <= 1) return false
    return true
  }

  return (
    <div className={styles.page}>
      <StudentNav userId={userId} profile={profile} school={school} schoolColor={schoolColor} />
      <div className={styles.content}>
        <DashboardHeader userId={userId} role="student" profile={profile} school={school}
          schoolColor={schoolColor} title="Quizzes" showBack />
        <main className={styles.main}>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#EF444415', border: '1px solid #EF444440', borderRadius: 10, marginBottom: 'var(--space-4)' }}>
              <span style={{ fontSize: '0.8rem', color: '#EF4444', flex: 1 }}>⚠️ {error}</span>
              <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 800 }}>✕</button>
            </div>
          )}

          {loading ? <div className={styles.loading}><span /><span /><span /></div>
            : quizzes.length === 0
              ? <div className={styles.empty}>
                  <AwardIcon size={40} color="var(--text-faint)" strokeWidth={1} />
                  <p>No quizzes available yet</p>
                </div>
              : <div className={styles.list}>
                  {quizzes.map(q => {
                    const status  = deriveStatus(q)
                    const attempt = attempts[q.id]
                    const done    = !!attempt
                    const pct     = done && attempt.max_score > 0
                      ? Math.round((attempt.score / attempt.max_score) * 100)
                      : null

                    return (
                      <div key={q.id} style={{
                        background: 'var(--glass-bg)', border: `1px solid ${done ? '#10B98130' : 'var(--glass-border)'}`,
                        borderRadius: 14, padding: '16px', display: 'flex', flexDirection: 'column', gap: 10,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                          <div style={{ width: 40, height: 40, borderRadius: 10, background: STATUS_COLOR[status] + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <AwardIcon size={18} color={STATUS_COLOR[status]} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: '0 0 3px', fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {q.title}
                            </p>
                            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              {q.total_marks} marks
                              {q.attempt_limit > 1 && ` · ${q.attempt_limit} attempts`}
                            </p>
                          </div>
                          <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: '0.65rem', fontWeight: 700, flexShrink: 0, background: STATUS_COLOR[status] + '20', color: STATUS_COLOR[status] }}>
                            {done ? (pct !== null ? `${pct}%` : 'Done') : STATUS_LABEL[status]}
                          </span>
                        </div>

                        {/* Score display if graded */}
                        {done && attempt.score !== null && (
                          <div style={{ background: '#10B98110', border: '1px solid #10B98130', borderRadius: 10, padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Your score</span>
                            <span style={{ fontWeight: 800, color: '#10B981', fontSize: '0.92rem' }}>
                              {attempt.score}/{attempt.max_score}
                            </span>
                          </div>
                        )}

                        {/* Timing info */}
                        {!done && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            <ClockIcon size={12} color="var(--text-muted)" />
                            {status === 'live'
                              ? `Closes ${new Date(q.ends_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                              : status === 'upcoming'
                                ? `Opens ${new Date(q.starts_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}`
                                : `Ended ${new Date(q.ends_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}`
                            }
                          </div>
                        )}

                        {/* Start button */}
                        {canStart(q) && (
                          <button onClick={() => router.push(`/dashboard/student/quizzes/${q.id}`)}
                            style={{ width: '100%', height: 42, background: schoolColor, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                            {done ? 'Retake Quiz' : 'Start Quiz'}
                          </button>
                        )}
                        {!canStart(q) && status === 'live' && done && (
                          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>
                            Maximum attempts reached
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
          }
          <div className={styles.spacer} />
        </main>
      </div>
    </div>
  )
}
  
