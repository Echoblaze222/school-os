'use client'
// src/app/dashboard/teacher/grades/GradeSubmissionsClient.tsx
//
// FIXED (in sync with page.tsx fixes):
//
// 1. sub.notes → sub.text_response
//    'notes' column doesn't exist on assignment_submissions. The student's
//    written answer is in text_response (and mirrored to answer_text).
//    The UI label is updated to "Student's Answer" to reflect this.
//
// 2. filterTab 'pending' now correctly matches status !== 'graded'
//    Students submit with status='submitted', not 'pending'. The old
//    filter (s.status === 'pending') would show 0 results in the Pending
//    tab even though the teacher had submissions waiting.
//
// 3. Status type updated to match real enum:
//    'pending' | 'submitted' | 'graded' | 'late'
//    (was 'pending' | 'graded' | 'returned')
//
// All grading logic and UI layout preserved exactly.

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import type { Submission, AssignmentGroup } from './page'

interface Props {
  submissions:      Submission[]
  assignmentGroups: AssignmentGroup[]
  teacherId:        string
  profile:          any
  school:           any
}

type FilterTab = 'pending' | 'graded' | 'all'

function initials(n: string) {
  return n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}
function relTime(iso: string) {
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
function computeGrade(score: number, max: number) {
  const pct = max > 0 ? (score / max) * 100 : 0
  if (pct >= 75) return 'A'
  if (pct >= 65) return 'B'
  if (pct >= 50) return 'C'
  if (pct >= 40) return 'D'
  return 'F'
}
function gradeColor(g: string) {
  if (g === 'A') return '#10B981'
  if (g === 'B') return '#3B82F6'
  if (g === 'C') return '#F59E0B'
  if (g === 'D') return '#F97316'
  return '#EF4444'
}

export default function GradeSubmissionsClient({
  submissions: initialSubs,
  assignmentGroups,
  teacherId,
  profile,
  school,
}: Props) {
  const [selectedAssignment, setSelectedAssignment] = useState<string | null>(
    assignmentGroups[0]?.assignment_id ?? null
  )
  const [filterTab,      setFilterTab]      = useState<FilterTab>('pending')
  const [submissions,    setSubmissions]    = useState<Submission[]>(initialSubs)
  const [scoreInputs,    setScoreInputs]    = useState<Record<string, string>>({})
  const [feedbackInputs, setFeedbackInputs] = useState<Record<string, string>>({})
  const [savingIds,      setSavingIds]      = useState<Set<string>>(new Set())

  const sc = school?.primary_color ?? '#7C3AED'

  const selectedGroup = assignmentGroups.find(g => g.assignment_id === selectedAssignment)

  const visibleSubs = useMemo(() => {
    if (!selectedAssignment) return []
    return submissions
      .filter(s => {
        if (s.assignment_id !== selectedAssignment) return false
        // FIX: 'pending' tab = needs grading = status is NOT 'graded'
        // (covers 'submitted', 'late', and legacy 'pending' rows)
        if (filterTab === 'pending') return s.status !== 'graded'
        if (filterTab === 'graded')  return s.status === 'graded'
        return true
      })
      .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())
  }, [submissions, selectedAssignment, filterTab])

  async function saveGrade(sub: Submission) {
    const scoreStr = scoreInputs[sub.id]
    if (scoreStr === undefined || scoreStr === '') return
    const score    = Math.min(Math.max(Number(scoreStr), 0), sub.max_score)
    const feedback = feedbackInputs[sub.id] ?? ''

    setSavingIds(prev => new Set(prev).add(sub.id))
    const supabase = createClient()

    const { error } = await supabase
      .from('assignment_submissions')
      .update({
        score,
        feedback:  feedback || null,
        status:    'graded',
        graded_at: new Date().toISOString(),
        graded_by: teacherId,
      })
      .eq('id', sub.id)

    setSavingIds(prev => { const n = new Set(prev); n.delete(sub.id); return n })

    if (!error) {
      setSubmissions(prev => prev.map(s =>
        s.id === sub.id ? { ...s, score, feedback: feedback || null, status: 'graded' } : s
      ))
      // Clear edit state so the graded view shows immediately
      setScoreInputs(p => { const n = { ...p }; delete n[sub.id]; return n })
      setFeedbackInputs(p => { const n = { ...p }; delete n[sub.id]; return n })
    }
  }

  return (
    <RolePageWrapper
      userId={teacherId}
      role="teacher"
      profile={profile}
      school={school}
      title="Grade Submissions"
    >
      {assignmentGroups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: '2rem', marginBottom: 8 }}>📋</p>
          <p>No assignments with submissions yet.</p>
          <p style={{ fontSize: '0.78rem', marginTop: 8, color: 'var(--text-muted)' }}>
            Submissions will appear here once students submit their work.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--space-4)' }}>

          {/* Assignment selector */}
          <div>
            <p style={{
              fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.1em',
              textTransform: 'uppercase' as const, color: 'var(--text-muted)',
              margin: '0 0 var(--space-3)',
            }}>
              Select Assignment ({assignmentGroups.length})
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {assignmentGroups.map(g => (
                <button
                  key={g.assignment_id}
                  onClick={() => { setSelectedAssignment(g.assignment_id); setFilterTab('pending') }}
                  style={{
                    textAlign: 'left' as const,
                    padding: '10px 14px',
                    background: selectedAssignment === g.assignment_id ? sc + '18' : 'var(--glass-bg)',
                    border: `1px solid ${selectedAssignment === g.assignment_id ? sc + '60' : 'var(--glass-border)'}`,
                    borderRadius: 10,
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        margin: '0 0 2px', fontWeight: 700, fontSize: '0.88rem',
                        color: selectedAssignment === g.assignment_id ? sc : 'var(--text-primary)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {g.title}
                      </p>
                      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                        {g.subject_name} · {g.class_name}
                        {g.due_date ? ` · Due ${fmtDate(g.due_date)}` : ''}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexShrink: 0, marginLeft: 8 }}>
                      {g.pending_count > 0 && (
                        <span style={{
                          padding: '2px 8px', borderRadius: 999,
                          background: '#EF444420', color: '#EF4444',
                          fontSize: '0.68rem', fontWeight: 800,
                        }}>
                          {g.pending_count} pending
                        </span>
                      )}
                      {g.graded_count > 0 && (
                        <span style={{
                          padding: '2px 8px', borderRadius: 999,
                          background: '#10B98120', color: '#10B981',
                          fontSize: '0.68rem', fontWeight: 800,
                        }}>
                          {g.graded_count} graded
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Grading panel */}
          {selectedGroup && (
            <div>
              {/* Assignment header */}
              <div style={{
                padding: '12px 14px',
                background: 'var(--glass-bg)',
                border: '1px solid var(--glass-border)',
                borderRadius: 10,
                marginBottom: 'var(--space-3)',
              }}>
                <p style={{ margin: '0 0 2px', fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                  {selectedGroup.title}
                </p>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                  {selectedGroup.subject_name} · {selectedGroup.class_name} · Max: {selectedGroup.max_score}pts
                </p>
              </div>

              {/* Filter tabs */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--space-4)' }}>
                {(['pending', 'graded', 'all'] as FilterTab[]).map(t => (
                  <button key={t} onClick={() => setFilterTab(t)}
                    style={{
                      padding: '6px 12px', borderRadius: 999,
                      background: filterTab === t ? sc : 'var(--glass-bg)',
                      border: `1px solid ${filterTab === t ? sc : 'var(--glass-border)'}`,
                      color: filterTab === t ? '#fff' : 'var(--text-muted)',
                      fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                    }}>
                    {t === 'pending' ? `Needs Grading (${selectedGroup.pending_count})`
                      : t === 'graded' ? `Graded (${selectedGroup.graded_count})`
                      : 'All'}
                  </button>
                ))}
              </div>

              {visibleSubs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--text-muted)' }}>
                  {filterTab === 'pending'
                    ? '✅ All caught up — no pending submissions!'
                    : 'No submissions here.'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {visibleSubs.map(sub => {
                    const isGraded = sub.status === 'graded'
                    const isSaving = savingIds.has(sub.id)
                    const scoreStr = scoreInputs[sub.id] ?? (sub.score !== null ? String(sub.score) : '')
                    const grade    = scoreStr !== '' ? computeGrade(Number(scoreStr), sub.max_score) : '—'

                    return (
                      <div key={sub.id} style={{
                        padding: '14px',
                        background: 'var(--glass-bg)',
                        border: `1px solid ${isGraded && scoreInputs[sub.id] === undefined ? '#10B98130' : 'var(--glass-border)'}`,
                        borderRadius: 12,
                      }}>

                        {/* Student info row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: '50%',
                            background: sc + '20',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 800, color: sc, fontSize: '0.8rem', flexShrink: 0,
                          }}>
                            {initials(sub.student_name)}
                          </div>
                          <div style={{ flex: 1 }}>
                            <p style={{ margin: '0 0 1px', fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.88rem' }}>
                              {sub.student_name}
                            </p>
                            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                              {sub.student_number ? `${sub.student_number} · ` : ''}
                              Submitted {relTime(sub.submitted_at)}
                              {sub.status === 'late' && (
                                <span style={{ color: '#F97316', fontWeight: 700, marginLeft: 4 }}>· Late</span>
                              )}
                            </p>
                          </div>

                          {/* Already graded display */}
                          {isGraded && scoreInputs[sub.id] === undefined && (
                            <div style={{ textAlign: 'right' as const }}>
                              <span style={{
                                fontSize: '1.1rem', fontWeight: 800,
                                color: gradeColor(computeGrade(sub.score!, sub.max_score)),
                              }}>
                                {sub.score}/{sub.max_score}
                              </span>
                              <span style={{
                                marginLeft: 6, padding: '2px 7px', borderRadius: 4,
                                background: gradeColor(computeGrade(sub.score!, sub.max_score)) + '20',
                                color: gradeColor(computeGrade(sub.score!, sub.max_score)),
                                fontSize: '0.72rem', fontWeight: 800,
                              }}>
                                {computeGrade(sub.score!, sub.max_score)}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* FIX: was sub.notes — real column is text_response */}
                        {sub.text_response && (
                          <div style={{
                            margin: '0 0 8px',
                            background: 'var(--glass-bg)',
                            border: '1px solid var(--glass-border)',
                            borderRadius: 6, padding: '8px 10px',
                          }}>
                            <p style={{
                              fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)',
                              textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px',
                            }}>
                              Student's Answer
                            </p>
                            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                              {sub.text_response}
                            </p>
                          </div>
                        )}

                        {/* File link */}
                        {sub.file_url && (
                          <a href={sub.file_url} target="_blank" rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              fontSize: '0.75rem', fontWeight: 600, color: sc,
                              marginBottom: 8, textDecoration: 'none',
                            }}>
                            📎 View Submission →
                          </a>
                        )}

                        {/* Grade form — shown for pending/submitted OR when editing a graded submission */}
                        {(!isGraded || scoreInputs[sub.id] !== undefined) && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <input
                                type="number" min={0} max={sub.max_score}
                                placeholder={`Score (0–${sub.max_score})`}
                                value={scoreStr}
                                onChange={e => setScoreInputs(p => ({ ...p, [sub.id]: e.target.value }))}
                                style={{
                                  width: 100, height: 38, padding: '0 10px',
                                  background: 'var(--input-bg)',
                                  border: `1px solid ${sc}60`,
                                  borderRadius: 8, color: 'var(--text-primary)',
                                  fontSize: '0.9rem', fontWeight: 700, outline: 'none',
                                }}
                              />
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                / {sub.max_score}
                              </span>
                              {scoreStr !== '' && (
                                <span style={{
                                  padding: '3px 10px', borderRadius: 6,
                                  background: gradeColor(grade) + '20',
                                  color: gradeColor(grade),
                                  fontSize: '0.8rem', fontWeight: 800,
                                }}>
                                  {grade}
                                </span>
                              )}
                            </div>
                            <textarea
                              placeholder="Feedback for student (optional)..."
                              value={feedbackInputs[sub.id] ?? sub.feedback ?? ''}
                              onChange={e => setFeedbackInputs(p => ({ ...p, [sub.id]: e.target.value }))}
                              rows={2}
                              style={{
                                width: '100%', padding: '8px 12px',
                                background: 'var(--input-bg)',
                                border: '1px solid var(--input-border)',
                                borderRadius: 8, color: 'var(--text-primary)',
                                fontSize: '0.82rem', outline: 'none', resize: 'vertical',
                                boxSizing: 'border-box' as const,
                              }}
                            />
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={() => saveGrade(sub)}
                                disabled={isSaving || scoreStr === ''}
                                style={{
                                  flex: 1, height: 38,
                                  background: scoreStr !== '' ? sc : 'var(--glass-bg)',
                                  color: scoreStr !== '' ? '#fff' : 'var(--text-muted)',
                                  border: 'none', borderRadius: 8,
                                  fontWeight: 700, fontSize: '0.82rem',
                                  cursor: scoreStr !== '' ? 'pointer' : 'default',
                                  opacity: isSaving ? 0.6 : 1,
                                }}>
                                {isSaving ? 'Saving...' : isGraded ? '✏️ Update Grade' : 'Save Grade'}
                              </button>
                              {isGraded && (
                                <button
                                  onClick={() => {
                                    setScoreInputs(p => { const n = { ...p }; delete n[sub.id]; return n })
                                    setFeedbackInputs(p => { const n = { ...p }; delete n[sub.id]; return n })
                                  }}
                                  style={{
                                    height: 38, padding: '0 12px',
                                    background: 'transparent',
                                    border: '1px solid var(--glass-border)',
                                    borderRadius: 8, color: 'var(--text-muted)',
                                    fontSize: '0.78rem', cursor: 'pointer',
                                  }}>
                                  Cancel
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Edit grade link for already-graded submissions */}
                        {isGraded && scoreInputs[sub.id] === undefined && (
                          <button
                            onClick={() => {
                              setScoreInputs(p => ({ ...p, [sub.id]: String(sub.score ?? '') }))
                              setFeedbackInputs(p => ({ ...p, [sub.id]: sub.feedback ?? '' }))
                            }}
                            style={{
                              marginTop: 4, fontSize: '0.7rem', fontWeight: 700,
                              color: sc, background: 'none', border: 'none',
                              cursor: 'pointer', padding: 0,
                            }}>
                            Edit grade
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <div style={{ height: 100 }} />
    </RolePageWrapper>
  )
}
