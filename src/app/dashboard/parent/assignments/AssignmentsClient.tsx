'use client'
// src/app/dashboard/parent/assignments/AssignmentsClient.tsx
//
// Read-only parent view of a child's assignments: title, subject, due date,
// status (pending/submitted/graded/overdue), score, and teacher feedback.
// Parents do not submit work here — submissions stay tied to the student's
// own account (src/app/dashboard/student/assignments/AssignmentsClient.tsx).
//
// Schema confirmed against the already-fixed student-side file:
//   assignments: id, title, description, due_date, file_url, max_score,
//     subject, created_at, class_id, school_id, status ('active' = visible)
//   assignment_submissions: id, assignment_id, student_id, file_url,
//     text_response, answer_text, status (pending|submitted|graded|late),
//     score, feedback, submitted_at, graded_at, graded_by
//     — NO school_id column on this table.
//
// Supports parents with more than one linked child (profiles.parent_id is
// not unique per parent) via a child switcher, instead of assuming .single().

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { ClipboardIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

type Tab = 'pending' | 'submitted' | 'all'

export default function AssignmentsClient({ profile, school, userId }: Props) {
  const [children, setChildren] = useState<any[]>([])
  const [childId,  setChildId]  = useState<string | null>(null)
  const [items,    setItems]    = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState<Tab>('pending')
  const [error,    setError]    = useState<string | null>(null)

  const supabase = createClient()
  const sc = school?.primary_color ?? '#7C3AED'
  const child = children.find(c => c.id === childId) ?? null

  useEffect(() => { loadChildren() }, [])
  useEffect(() => { if (childId) loadAssignments(childId) }, [childId])

  async function loadChildren() {
    setLoading(true)
    setError(null)
    // A parent can have more than one linked child — never assume .single()
    const { data: childData, error: err } = await supabase
      .from('profiles')
      .select('id, full_name, class_level, class_id')
      .eq('parent_id', userId)
      .order('full_name')

    if (err) { setError(err.message); setLoading(false); return }

    if (!childData || childData.length === 0) {
      setChildren([])
      setLoading(false)
      return
    }

    setChildren(childData)
    setChildId(childData[0].id)
    // loadAssignments fires via the childId effect once childId is set
  }

  async function loadAssignments(studentId: string) {
    setLoading(true)
    setError(null)
    const childData = children.find(c => c.id === studentId)
    if (!childData?.class_id) { setItems([]); setLoading(false); return }

    // This child's existing submissions (no school_id on this table)
    const { data: subs, error: subsErr } = await supabase
      .from('assignment_submissions')
      .select('id, assignment_id, status, score, feedback, submitted_at, file_url, text_response, answer_text')
      .eq('student_id', studentId)

    if (subsErr) {
      console.error('[parent assignments] load submissions error:', subsErr.message)
      setError(subsErr.message)
    }

    const subMap: Record<string, any> = {}
    subs?.forEach((s: any) => { subMap[s.assignment_id] = s })

    // Assignments for this child's class
    const { data: assignments, error: asgErr } = await supabase
      .from('assignments')
      .select('id, title, description, due_date, file_url, max_score, subject, created_at, class_id')
      .eq('school_id', school?.id)
      .eq('class_id', childData.class_id)
      .eq('status', 'active')
      .order('due_date', { ascending: true })

    if (asgErr) {
      console.error('[parent assignments] load assignments error:', asgErr.message)
      setError(asgErr.message)
    }

    if (assignments) {
      setItems(assignments.map((a: any) => ({
        ...a,
        submission: subMap[a.id] ?? null,
      })))
    } else {
      setItems([])
    }
    setLoading(false)
  }

  const filtered = tab === 'all' ? items
    : tab === 'submitted'
      ? items.filter(i => ['submitted', 'graded', 'late'].includes(i.submission?.status))
      : items.filter(i => !i.submission || i.submission?.status === 'pending')

  function isOverdue(due: string) { return new Date(due) < new Date() }

  return (
    <RolePageWrapper userId={userId} role="parent" profile={profile} school={school} title="Assignments">

      {/* Error banner */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
          background: '#EF444415', border: '1px solid #EF444440', borderRadius: 10,
          marginBottom: 'var(--space-4)' }}>
          <span style={{ fontSize: '0.8rem', color: '#EF4444', flex: 1 }}>⚠️ {error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none',
            color: '#EF4444', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 800 }}>✕</button>
        </div>
      )}

      {loading && children.length === 0
        ? <div className={styles.loading}><span/><span/><span/></div>
        : children.length === 0
          ? <div className={styles.empty}>
              <ClipboardIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
              <p>No child linked to your account.</p>
            </div>
          : <>
              {/* Child switcher — only shown when parent has more than one linked child */}
              {children.length > 1 && (
                <div style={{ display:'flex', gap:8, marginBottom:'var(--space-4)', overflowX:'auto' }}>
                  {children.map(c => (
                    <button key={c.id} onClick={() => setChildId(c.id)}
                      style={{
                        flexShrink:0, padding:'8px 16px', borderRadius:20, fontWeight:700,
                        fontSize:'0.82rem', cursor:'pointer', border:'1px solid var(--glass-border)',
                        background: c.id === childId ? sc : 'var(--input-bg)',
                        color: c.id === childId ? '#fff' : 'var(--text-muted)',
                      }}>
                      {c.full_name?.split(' ')[0] ?? 'Child'}
                    </button>
                  ))}
                </div>
              )}

              <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginBottom:'var(--space-4)' }}>
                Assignments for <strong style={{ color:'var(--text-primary)' }}>{child?.full_name}</strong> · {child?.class_level}
              </p>

              {/* Tab bar */}
              <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-5)', flexWrap: 'wrap' }}>
                {([['pending', 'Pending'], ['submitted', 'Submitted'], ['all', 'All']] as const).map(([v, l]) => (
                  <button key={v} onClick={() => setTab(v)}
                    style={{ padding: '6px 14px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700,
                      background: tab === v ? sc : 'var(--glass-bg)',
                      color:      tab === v ? '#fff' : 'var(--text-muted)',
                      border:    `1px solid ${tab === v ? sc : 'var(--glass-border)'}`, cursor: 'pointer' }}>
                    {l}
                  </button>
                ))}
              </div>

              {loading
                ? <div className={styles.loading}><span/><span/><span/></div>
                : filtered.length === 0
                  ? <div className={styles.empty}>
                      <ClipboardIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
                      <p>No {tab} assignments</p>
                    </div>
                  : <div className={styles.list}>
                      {filtered.map(item => {
                        const sub       = item.submission
                        const submitted = ['submitted', 'graded', 'late'].includes(sub?.status)
                        const graded    = sub?.score != null
                        const overdue   = !submitted && item.due_date && isOverdue(item.due_date)

                        return (
                          <div key={item.id} className={styles.card}
                            style={{ flexDirection: 'column', gap: 10, cursor: 'default' }}>

                            {/* Header row */}
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%' }}>
                              <div className={styles.cardIcon}
                                style={{ background: submitted ? '#10B98120' : overdue ? '#EF444420' : sc + '20', flexShrink: 0 }}>
                                <ClipboardIcon size={16} color={submitted ? '#10B981' : overdue ? '#EF4444' : sc}/>
                              </div>
                              <div className={styles.cardBody} style={{ flex: 1, minWidth: 0 }}>
                                <p className={styles.cardTitle}>{item.title}</p>
                                {item.subject && (
                                  <p style={{ fontSize: '0.7rem', fontWeight: 700, color: sc,
                                    margin: '2px 0 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    {item.subject}
                                  </p>
                                )}
                                {item.description && (
                                  <p className={styles.cardText} style={{ fontSize: '0.78rem', marginTop: 2 }}>
                                    {item.description}
                                  </p>
                                )}
                                <p className={styles.cardMeta} style={{ marginTop: 4 }}>
                                  {item.due_date
                                    ? `Due ${new Date(item.due_date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}`
                                    : 'No due date'}
                                  {overdue && <span style={{ color: '#EF4444', marginLeft: 6, fontWeight: 700 }}>· Overdue</span>}
                                  {graded && (
                                    <span style={{ color: '#10B981', marginLeft: 6, fontWeight: 700 }}>
                                      · Score: {sub.score}/{item.max_score}
                                    </span>
                                  )}
                                </p>
                              </div>
                              <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: '0.65rem', fontWeight: 700,
                                flexShrink: 0, whiteSpace: 'nowrap',
                                background: submitted ? '#10B98120' : overdue ? '#EF444420' : '#F59E0B20',
                                color:      submitted ? '#10B981'   : overdue ? '#EF4444'   : '#F59E0B' }}>
                                {submitted ? (graded ? 'Graded' : 'Submitted') : overdue ? 'Overdue' : 'Pending'}
                              </span>
                            </div>

                            {/* Teacher brief attachment */}
                            {item.file_url && (
                              <div style={{ paddingLeft: 52 }}>
                                <a href={item.file_url} target="_blank" rel="noreferrer"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.75rem',
                                    fontWeight: 700, color: sc, textDecoration: 'none',
                                    padding: '5px 12px', background: sc + '15', borderRadius: 8 }}>
                                  📎 View Assignment Brief
                                </a>
                              </div>
                            )}

                            {/* What the child submitted + teacher feedback (read-only) */}
                            {submitted && (
                              <div style={{ paddingLeft: 52, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {(sub?.text_response || sub?.answer_text) && (
                                  <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                                    borderRadius: 10, padding: '10px 14px' }}>
                                    <p style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)',
                                      textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                                      {child?.full_name?.split(' ')[0] ?? 'Their'}'s Written Answer
                                    </p>
                                    <p style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.6, margin: 0 }}>
                                      {sub.text_response ?? sub.answer_text}
                                    </p>
                                  </div>
                                )}
                                {sub?.file_url && (
                                  <a href={sub.file_url} target="_blank" rel="noreferrer"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.72rem',
                                      fontWeight: 600, color: '#10B981', textDecoration: 'none',
                                      padding: '5px 10px', background: '#10B98115', borderRadius: 8, alignSelf: 'flex-start' }}>
                                    📤 Submitted File
                                  </a>
                                )}
                                {sub?.feedback && (
                                  <div style={{ background: sc + '10', border: `1px solid ${sc}30`,
                                    borderRadius: 10, padding: '10px 14px' }}>
                                    <p style={{ fontSize: '0.65rem', fontWeight: 700, color: sc,
                                      textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                                      Teacher Feedback
                                    </p>
                                    <p style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.5, margin: 0 }}>
                                      {sub.feedback}
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Not yet submitted — informational only, no submit action for parents */}
                            {!submitted && (
                              <div style={{ paddingLeft: 52 }}>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                                  {child?.full_name?.split(' ')[0] ?? 'Your child'} hasn't submitted this yet.
                                  They can submit it from their own student account.
                                </p>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
              }
            </>
      }
      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}
