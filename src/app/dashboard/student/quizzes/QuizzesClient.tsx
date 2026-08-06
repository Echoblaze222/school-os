'use client'
// src/app/dashboard/student/quizzes/QuizzesClient.tsx
// FIX: old file selected non-existent columns: `subject`, `question_count`,
// `status` — these don't exist on the real `quizzes` table. Real columns are:
// id, title, total_marks, attempt_limit, starts_at, ends_at, class_id.
// Status is now derived from starts_at/ends_at (same logic as teacher side).
// Also: no error handling on load — added error banner.
//
// REDESIGN PASS (Lane 3 — Student): RolePageWrapper chrome, emoji → Icons,
// glass-card/motion treatment, hardcoded status hex → design tokens.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { AwardIcon, ClockIcon, AlertIcon, XIcon } from '@/components/Icons'
import motion from '@/components/dashboard-motion.module.css'
import styles from './page.module.css'

interface Props { profile: any; school: any; userId: string }

function deriveStatus(q: any): 'upcoming' | 'live' | 'ended' {
  const now = new Date()
  if (new Date(q.starts_at) > now) return 'upcoming'
  if (new Date(q.ends_at)   > now) return 'live'
  return 'ended'
}

const STATUS_COLOR = { live: 'var(--success)', upcoming: 'var(--warning)', ended: 'var(--text-muted)' }
const STATUS_BG    = { live: 'var(--success-subtle)', upcoming: 'var(--warning-subtle)', ended: 'var(--glass-bg)' }
const STATUS_LABEL = { live: 'Available now', upcoming: 'Upcoming', ended: 'Ended' }

export default function QuizzesClient({ profile, school, userId }: Props) {
  const [quizzes,  setQuizzes]  = useState<any[]>([])
  const [attempts, setAttempts] = useState<Record<string, any>>({})
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const supabase    = createClient()
  const schoolColor = school?.primary_color ?? '#800020'
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
    <RolePageWrapper userId={userId} role="student" profile={profile} school={school} title="Quizzes">
        <>

          {error && (
            <div className={`glass-card ${motion.riseIn}`} style={{ display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px', background: 'var(--danger-subtle)', borderColor: 'rgba(239,68,68,0.3)', marginBottom: 'var(--space-4)' }}>
              <AlertIcon size={16} color="var(--danger)" />
              <span style={{ fontSize: '0.8rem', color: 'var(--danger)', flex: 1 }}>{error}</span>
              <button onClick={() => setError(null)} className={motion.pressable}
                style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', display: 'flex', padding: 4 }}>
                <XIcon size={14} />
              </button>
            </div>
          )}

          {loading ? <div className={styles.loading}><span /><span /><span /></div>
            : quizzes.length === 0
              ? <div className={`${styles.empty} ${motion.riseIn}`}>
                  <AwardIcon size={40} color="var(--text-faint)" strokeWidth={1} />
                  <p>No quizzes available yet</p>
                </div>
              : <div className={styles.list}>
                  {quizzes.map((q, idx) => {
                    const status  = deriveStatus(q)
                    const attempt = attempts[q.id]
                    const done    = !!attempt
                    const pct     = done && attempt.max_score > 0
                      ? Math.round((attempt.score / attempt.max_score) * 100)
                      : null

                    return (
                      <div key={q.id} className={`glass-card ${motion.staggerItem}`} style={{
                        borderColor: done ? 'rgba(16,185,129,0.3)' : undefined,
                        flexDirection: 'column', alignItems: 'stretch', gap: 10, animationDelay: `${idx * 40}ms`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                          <div style={{ width: 40, height: 40, borderRadius: 10, background: STATUS_BG[status], display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
                          <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: '0.65rem', fontWeight: 700, flexShrink: 0, background: STATUS_BG[status], color: STATUS_COLOR[status] }}>
                            {done ? (pct !== null ? `${pct}%` : 'Done') : STATUS_LABEL[status]}
                          </span>
                        </div>

                        {/* Score display if graded */}
                        {done && attempt.score !== null && (
                          <div style={{ background: 'var(--success-subtle)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Your score</span>
                            <span style={{ fontWeight: 800, color: 'var(--success)', fontSize: '0.92rem' }}>
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
                          <button onClick={() => router.push(`/dashboard/student/quizzes/${q.id}`)} className={`btn btn-primary ${motion.pressable}`}>
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
        </>
    </RolePageWrapper>
  )
}
