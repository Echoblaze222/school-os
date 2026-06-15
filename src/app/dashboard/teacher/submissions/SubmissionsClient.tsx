'use client'
// src/app/dashboard/teacher/submissions/SubmissionsClient.tsx

import { useEffect, useState } from 'react'
import { useRouter }           from 'next/navigation'
import { createClient }        from '@/lib/supabase/client'
import RolePageWrapper         from '@/components/RolePageWrapper'
import styles                  from './submissions.module.css'

export interface Submission {
  id: string; student_id: string; student_name: string; student_avatar: string | null
  assignment_id: string; assignment_title: string; class_name: string; subject: string
  max_score: number; submitted_at: string; file_url: string | null; file_name: string | null
  answer_text: string | null
  score: number | null; feedback: string | null; graded_at: string | null; status: string
}

interface Props {
  submissions: Submission[]
  graderId:    string
  // RolePageWrapper needs these — page.tsx must pass them (see note below)
  profile?:    any
  school?:     any
}

function initials(n: string) {
  return n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-NG', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function SubjectBadge({ subject }: { subject: string }) {
  const colors = ['var(--info)', 'var(--success)', 'var(--warning)', 'var(--text-accent)', '#9B59B6']
  const c = colors[subject.split('').reduce((a, x) => a + x.charCodeAt(0), 0) % colors.length]
  return (
    <span style={{
      fontFamily: 'var(--font-body)', fontSize: '0.62rem', fontWeight: 700,
      letterSpacing: '0.07em', textTransform: 'uppercase',
      padding: '2px 8px', borderRadius: '999px',
      background: c + '18', color: c, border: `1px solid ${c}44`,
    }}>
      {subject}
    </span>
  )
}

export default function SubmissionsClient({
  submissions: initial, graderId, profile, school,
}: Props) {
  const router   = useRouter()
  const supabase = createClient()

  const [submissions, setSubmissions] = useState(initial)
  const [filter,      setFilter]      = useState<'all' | 'ungraded' | 'graded'>('ungraded')
  const [expanded,    setExpanded]    = useState<string | null>(null)
  const [scores,      setScores]      = useState<Record<string, string>>({})
  const [feedbacks,   setFeedbacks]   = useState<Record<string, string>>({})
  const [saving,      setSaving]      = useState<string | null>(null)
  const [saveErrors,  setSaveErrors]  = useState<Record<string, string>>({})

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-theme',
      localStorage.getItem('schoolos_theme') ?? 'dark',
    )
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

    if (!scoreStr) {
      setSaveErrors(e => ({ ...e, [sub.id]: 'Enter a score' }))
      return
    }
    const score = Number(scoreStr)
    if (isNaN(score) || score < 0 || score > sub.max_score) {
      setSaveErrors(e => ({ ...e, [sub.id]: `Score must be 0–${sub.max_score}` }))
      return
    }

    setSaving(sub.id)
    setSaveErrors(e => { const n = { ...e }; delete n[sub.id]; return n })

    const { error } = await supabase
      .from('assignment_submissions')
      .update({
        score,
        feedback:   feedback || null,
        graded_at:  new Date().toISOString(),
        graded_by:  graderId,
        status:     'graded',
      })
      .eq('id', sub.id)

    if (error) {
      setSaveErrors(e => ({ ...e, [sub.id]: error.message }))
      setSaving(null)
      return
    }

    setSubmissions(prev =>
      prev.map(s =>
        s.id === sub.id
          ? { ...s, score, feedback, graded_at: new Date().toISOString(), status: 'graded' }
          : s,
      ),
    )
    setSaving(null)
    setExpanded(null)
  }

  return (
    <RolePageWrapper
      userId={graderId}
      role="teacher"
      profile={profile ?? null}
      school={school  ?? null}
      title="Grade Submissions"
      showBack={false}
    >
      {/* ── Decorative glow ── */}
      <div
        style={{
          position: 'absolute', width: 300, height: 300,
          top: -60, right: -60, opacity: 0.4, borderRadius: '50%',
          background: 'radial-gradient(circle,var(--burgundy-glow) 0%,transparent 70%)',
          filter: 'blur(40px)', pointerEvents: 'none',
        }}
      />

      {/* ── Subtitle ── */}
      <p style={{
        fontFamily: 'var(--font-body)', fontSize: '0.72rem',
        color: 'var(--text-muted)', padding: '0 var(--space-5)',
        marginBottom: 'var(--space-2)',
      }}>
        {ungradedCount > 0 ? `${ungradedCount} awaiting review` : 'All caught up ✓'}
      </p>

      {/* ── Filter tabs ── */}
      <div className={styles.filterBar}>
        {(['ungraded', 'all', 'graded'] as const).map(f => (
          <button
            key={f}
            className={`${styles.filterTab} ${filter === f ? styles.filterTabActive : ''}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === 'ungraded' && ungradedCount > 0 && (
              <span className={styles.badge}>{ungradedCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── List ── */}
      <div className={styles.main}>
        {filtered.length === 0 ? (
          <div className={`glass-card ${styles.emptyState}`}>
            <svg
              width="40" height="40" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round"
              style={{ opacity: 0.4 }}
            >
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <p className={styles.emptyTitle}>
              {filter === 'ungraded' ? 'No pending submissions' : 'No submissions yet'}
            </p>
          </div>
        ) : (
          <div className={styles.list}>
            {filtered.map((sub, i) => {
              const isOpen   = expanded === sub.id
              const isGraded = sub.status === 'graded'
              const pct      = sub.score !== null
                ? Math.round((sub.score / sub.max_score) * 100)
                : null

              return (
                <div
                  key={sub.id}
                  className={`${styles.card} animate-fade-up`}
                  style={{ animationDelay: `${i * 40}ms`, opacity: 0 }}
                >
                  {/* ── Card header (tap to expand) ── */}
                  <div
                    className={styles.cardTop}
                    onClick={() => setExpanded(isOpen ? null : sub.id)}
                  >
                    <div className={styles.avatar}>
                      {sub.student_avatar
                        ? <img src={sub.student_avatar} alt={sub.student_name} className={styles.avatarImg}/>
                        : <span>{initials(sub.student_name)}</span>}
                    </div>

                    <div className={styles.cardInfo}>
                      <div className={styles.cardNameRow}>
                        <span className={styles.cardName}>{sub.student_name}</span>
                        <SubjectBadge subject={sub.subject}/>
                      </div>
                      <span className={styles.cardAssignment}>{sub.assignment_title}</span>
                      <span className={styles.cardMeta}>
                        {sub.class_name} · {fmtDate(sub.submitted_at)}
                      </span>
                    </div>

                    <div className={styles.cardRight}>
                      {isGraded ? (
                        <div className={styles.scoreDisplay}>
                          <span
                            className={styles.scoreNum}
                            style={{ color: pct! >= 50 ? 'var(--success)' : 'var(--error)' }}
                          >
                            {sub.score}/{sub.max_score}
                          </span>
                          <span className={styles.scoreLabel}>Graded</span>
                        </div>
                      ) : (
                        <span className={styles.pendingDot}>●</span>
                      )}
                      <svg
                        width="16" height="16" viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round"
                        style={{
                          color: 'var(--text-muted)',
                          transform: isOpen ? 'rotate(90deg)' : 'none',
                          transition: 'transform 0.2s',
                        }}
                      >
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </div>
                  </div>

                  {/* ── Expanded panel ── */}
                  {isOpen && (
                    <div className={styles.cardExpanded}>

                      {/* Student's written answer ── NEW */}
                      {sub.answer_text && (
                        <div style={{
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--glass-border)',
                          borderRadius: 'var(--radius-md)',
                          padding: 'var(--space-3) var(--space-4)',
                        }}>
                          <p style={{
                            fontFamily: 'var(--font-body)', fontSize: '0.72rem',
                            fontWeight: 700, color: 'var(--text-muted)',
                            textTransform: 'uppercase', letterSpacing: '0.06em',
                            marginBottom: 'var(--space-2)',
                          }}>
                            Student's Answer
                          </p>
                          <p style={{
                            fontFamily: 'var(--font-body)', fontSize: '0.88rem',
                            color: 'var(--text-primary)', whiteSpace: 'pre-wrap',
                            lineHeight: 1.6,
                          }}>
                            {sub.answer_text}
                          </p>
                        </div>
                      )}

                      {/* Uploaded file ── existing */}
                      {sub.file_url && (
                        <a
                          href={sub.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.fileLink}
                        >
                          <svg
                            width="14" height="14" viewBox="0 0 24 24"
                            fill="none" stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round"
                          >
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                          </svg>
                          {sub.file_name ?? 'View Submission'}
                        </a>
                      )}

                      {/* No submission content at all */}
                      {!sub.answer_text && !sub.file_url && (
                        <p style={{
                          fontFamily: 'var(--font-body)', fontSize: '0.8rem',
                          color: 'var(--text-muted)', fontStyle: 'italic',
                        }}>
                          No written answer or file attached.
                        </p>
                      )}

                      {/* Score */}
                      <div className={styles.gradeRow}>
                        <div className={styles.scoreField}>
                          <label className={styles.label}>Score</label>
                          <div className={styles.scoreInputRow}>
                            <input
                              className={`input ${styles.scoreInput}`}
                              type="number" min={0} max={sub.max_score}
                              value={scores[sub.id] ?? (sub.score !== null ? String(sub.score) : '')}
                              onChange={e => setScores(s => ({ ...s, [sub.id]: e.target.value }))}
                              placeholder={`0–${sub.max_score}`}
                            />
                            <span className={styles.maxScore}>/ {sub.max_score}</span>
                          </div>
                          {saveErrors[sub.id] && (
                            <p className={styles.fieldError}>{saveErrors[sub.id]}</p>
                          )}
                        </div>
                      </div>

                      {/* Feedback */}
                      <div className={styles.fieldGroup}>
                        <label className={styles.label}>
                          Feedback <span className={styles.opt}>(optional)</span>
                        </label>
                        <textarea
                          className={`input ${styles.textarea}`}
                          rows={3}
                          value={feedbacks[sub.id] ?? sub.feedback ?? ''}
                          onChange={e => setFeedbacks(f => ({ ...f, [sub.id]: e.target.value }))}
                          placeholder="Write feedback for the student…"
                        />
                      </div>

                      {/* Submit */}
                      <button
                        className={`btn btn-primary ${styles.gradeBtn}`}
                        onClick={() => handleGrade(sub)}
                        disabled={saving === sub.id}
                      >
                        {saving === sub.id
                          ? <><span className={styles.spinnerSm}/>Saving…</>
                          : <>{isGraded ? 'Update Grade' : 'Mark as Graded'}</>}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </RolePageWrapper>
  )
}
