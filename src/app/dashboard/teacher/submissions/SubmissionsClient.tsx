'use client'
// FIXED:
// 1. School branding — accent colour from school.primary_color replaces hardcoded --burgundy
// 2. Props extended: accepts school + profile from page.tsx
// 3. handleGrade() now updates existing grade OR sets new — same function handles both
// 4. Error messages surfaced in UI instead of only setSaveErrors
// 5. Uses RolePageWrapper so header/nav is consistent with rest of teacher dashboard
// 6. filter bar uses school brand colour for active state

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import type { Submission } from './page'
import styles from './submissions.module.css'

interface Props {
  submissions: Submission[]
  graderId: string
  school: any
  profile: any
}

function initials(n: string) { return n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() }
function fmtDate(s: string) { return new Date(s).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) }

function SubjectBadge({ subject, color }: { subject: string; color: string }) {
  return (
    <span style={{
      fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.07em',
      textTransform: 'uppercase', padding: '2px 8px', borderRadius: '999px',
      background: color + '18', color, border: `1px solid ${color}44`,
    }}>
      {subject}
    </span>
  )
}

export default function SubmissionsClient({ submissions: initial, graderId, school, profile }: Props) {
  const supabase = createClient()
  const sc = school?.primary_color ?? '#7C3AED'

  const [submissions, setSubmissions] = useState(initial)
  const [filter,      setFilter]      = useState<'all' | 'ungraded' | 'graded'>('ungraded')
  const [expanded,    setExpanded]    = useState<string | null>(null)
  const [scores,      setScores]      = useState<Record<string, string>>({})
  const [feedbacks,   setFeedbacks]   = useState<Record<string, string>>({})
  const [saving,      setSaving]      = useState<string | null>(null)
  const [saveErrors,  setSaveErrors]  = useState<Record<string, string>>({})

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', localStorage.getItem('schoolos_theme') ?? 'dark')
  }, [])

  const filtered = submissions.filter(s => {
    if (filter === 'ungraded') return s.status !== 'graded'
    if (filter === 'graded')   return s.status === 'graded'
    return true
  })
  const ungradedCount = submissions.filter(s => s.status !== 'graded').length

  async function handleGrade(sub: Submission) {
    const scoreStr = scores[sub.id] ?? (sub.score !== null ? String(sub.score) : '')
    const feedback = feedbacks[sub.id] ?? sub.feedback ?? ''
    if (!scoreStr) { setSaveErrors(e => ({ ...e, [sub.id]: 'Enter a score' })); return }
    const score = Number(scoreStr)
    if (isNaN(score) || score < 0 || score > sub.max_score) {
      setSaveErrors(e => ({ ...e, [sub.id]: `Score must be 0–${sub.max_score}` }))
      return
    }
    setSaving(sub.id)
    setSaveErrors(e => { const n = { ...e }; delete n[sub.id]; return n })

    const { error } = await supabase.from('assignment_submissions').update({
      score,
      feedback: feedback || null,
      graded_at: new Date().toISOString(),
      graded_by: graderId,
      status: 'graded',
    }).eq('id', sub.id)

    if (error) {
      setSaveErrors(e => ({ ...e, [sub.id]: error.message }))
      setSaving(null)
      return
    }
    setSubmissions(prev => prev.map(s =>
      s.id === sub.id
        ? { ...s, score, feedback, graded_at: new Date().toISOString(), status: 'graded' }
        : s
    ))
    setSaving(null)
    setExpanded(null)
  }

  return (
    <RolePageWrapper userId={graderId} role="teacher" profile={profile} school={school} title="Grade Submissions">

      {/* Summary pill */}
      <div style={{ marginBottom: 'var(--space-3)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
        {ungradedCount > 0
          ? <span style={{ color: sc, fontWeight: 700 }}>{ungradedCount} awaiting review</span>
          : <span style={{ color: '#10B981', fontWeight: 700 }}>✓ All submissions graded</span>
        }
      </div>

      {/* Filter tabs */}
      <div className={styles.filterBar} style={{ marginBottom: 'var(--space-4)' }}>
        {(['ungraded', 'all', 'graded'] as const).map(f => (
          <button key={f}
            className={`${styles.filterTab} ${filter === f ? styles.filterTabActive : ''}`}
            style={filter === f ? { color: sc, borderBottomColor: sc } : {}}
            onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === 'ungraded' && ungradedCount > 0 && (
              <span className={styles.badge} style={{ background: sc + '20', color: sc }}>{ungradedCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <p className={styles.emptyTitle}>
            {filter === 'ungraded' ? 'No pending submissions' : 'No submissions found'}
          </p>
        </div>
      ) : (
        <div className={styles.list}>
          {filtered.map((sub, i) => {
            const isOpen   = expanded === sub.id
            const isGraded = sub.status === 'graded'
            const pct      = sub.score !== null ? Math.round((sub.score / sub.max_score) * 100) : null
            return (
              <div key={sub.id} className={styles.card}>
                <div className={styles.cardTop} onClick={() => setExpanded(isOpen ? null : sub.id)}>
                  <div className={styles.avatar}>
                    {sub.student_avatar
                      ? <img src={sub.student_avatar} alt={sub.student_name} className={styles.avatarImg} />
                      : <span>{initials(sub.student_name)}</span>
                    }
                  </div>
                  <div className={styles.cardInfo}>
                    <div className={styles.cardNameRow}>
                      <span className={styles.cardName}>{sub.student_name}</span>
                      <SubjectBadge subject={sub.subject} color={sc} />
                    </div>
                    <span className={styles.cardAssignment}>{sub.assignment_title}</span>
                    <span className={styles.cardMeta}>{sub.class_name} · {fmtDate(sub.submitted_at)}</span>
                  </div>
                  <div className={styles.cardRight}>
                    {isGraded
                      ? (
                        <div className={styles.scoreDisplay}>
                          <span className={styles.scoreNum} style={{ color: pct! >= 50 ? '#10B981' : '#EF4444' }}>
                            {sub.score}/{sub.max_score}
                          </span>
                          <span className={styles.scoreLabel}>Graded</span>
                        </div>
                      )
                      : <span className={styles.pendingDot}>●</span>
                    }
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round"
                      style={{ color: 'var(--text-muted)', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </div>

                {isOpen && (
                  <div className={styles.cardExpanded}>
                    {/* View submission file */}
                    {sub.file_url && (
                      <a href={sub.file_url} target="_blank" rel="noopener noreferrer" className={styles.fileLink}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        {sub.file_name ?? 'View Submission'}
                      </a>
                    )}

                    {/* Score input */}
                    <div className={styles.gradeRow}>
                      <div className={styles.scoreField}>
                        <label className={styles.label}>
                          Score {isGraded && <span className={styles.opt}>(update grade)</span>}
                        </label>
                        <div className={styles.scoreInputRow}>
                          <input
                            className={`input ${styles.scoreInput}`}
                            type="number" min={0} max={sub.max_score}
                            value={scores[sub.id] ?? (sub.score !== null ? String(sub.score) : '')}
                            onChange={e => setScores(s => ({ ...s, [sub.id]: e.target.value }))}
                            placeholder={`0–${sub.max_score}`}
                            style={{ borderColor: saveErrors[sub.id] ? '#EF4444' : undefined }}
                          />
                          <span className={styles.maxScore}>/ {sub.max_score}</span>
                        </div>
                        {saveErrors[sub.id] && <p className={styles.fieldError}>{saveErrors[sub.id]}</p>}
                      </div>
                    </div>

                    {/* Feedback */}
                    <div className={styles.fieldGroup}>
                      <label className={styles.label}>
                        Feedback <span className={styles.opt}>(optional)</span>
                      </label>
                      <textarea className={`input ${styles.textarea}`} rows={3}
                        value={feedbacks[sub.id] ?? sub.feedback ?? ''}
                        onChange={e => setFeedbacks(f => ({ ...f, [sub.id]: e.target.value }))}
                        placeholder="Write feedback for the student…"
                      />
                    </div>

                    {/* Grade button */}
                    <button
                      className={styles.gradeBtn}
                      onClick={() => handleGrade(sub)}
                      disabled={saving === sub.id}
                      style={{ background: sc }}>
                      {saving === sub.id
                        ? <><span className={styles.spinnerSm} />Saving…</>
                        : <>{isGraded ? '✏️ Update Grade' : 'Mark as Graded'}</>
                      }
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <div style={{ height: 80 }} />
    </RolePageWrapper>
  )
}
