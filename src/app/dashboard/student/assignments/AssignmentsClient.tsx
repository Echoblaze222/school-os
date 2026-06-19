'use client'
// FIXED (schema-accurate):
// - assignment_submissions: NO school_id col, NO notes col → use text_response
// - assignment_submissions: NO unique constraint on (assignment_id,student_id)
//   → check for existing row first, then INSERT or UPDATE by id
// - status is submission_status enum: 'pending' | 'submitted' | 'graded' | 'late'
// - text_response is the written answer box (required unless file attached)
// - file_url is the optional file attachment

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import StudentNav from '@/components/StudentNav'
import { ClipboardIcon } from '@/components/Icons'
import styles from './page.module.css'

interface Props { profile: any; school: any; userId: string }

export default function AssignmentsClient({ profile, school, userId }: Props) {
  const [items,     setItems]     = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [tab,       setTab]       = useState<'pending' | 'submitted' | 'all'>('pending')
  const [expanded,  setExpanded]  = useState<string | null>(null)
  const [subFiles,  setSubFiles]  = useState<Record<string, File | null>>({})
  const [subText,   setSubText]   = useState<Record<string, string>>({})   // text_response per assignment
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const supabase    = createClient()
  const sc          = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [])

  async function load() {
    // Fetch this student's existing submissions
    const { data: subs } = await supabase
      .from('assignment_submissions')
      .select('id, assignment_id, status, score, feedback, submitted_at, file_url, text_response')
      .eq('student_id', userId)

    const subMap: Record<string, any> = {}
    subs?.forEach(s => { subMap[s.assignment_id] = s })

    // Fetch assignments for student's class (only real columns)
    const { data: assignments } = await supabase
      .from('assignments')
      .select('id, title, description, due_date, file_url, max_score, created_at, class_id')
      .eq('school_id', school?.id)
      .eq('class_id', profile?.class_id)
      .order('due_date', { ascending: true })

    if (assignments) {
      setItems(assignments.map((a: any) => ({
        ...a,
        submission: subMap[a.id] ?? null,
      })))
    }
    setLoading(false)
  }

  async function submitAssignment(assignmentId: string) {
    const file      = subFiles[assignmentId]
    const textResp  = (subText[assignmentId] ?? '').trim()

    // At least one of: written answer OR file required
    if (!textResp && !file) {
      alert('Please write your answer or attach a file before submitting.')
      return
    }

    setUploading(prev => ({ ...prev, [assignmentId]: true }))

    // Upload file if chosen
    let fileUrl: string | null = null
    if (file) {
      const ext  = file.name.split('.').pop()
      const path = `${school?.id}/submissions/${userId}/${assignmentId}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('assignments')
        .upload(path, file, { upsert: false })
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('assignments').getPublicUrl(path)
        fileUrl = urlData?.publicUrl ?? null
      } else {
        console.error('File upload failed:', upErr.message)
      }
    }

    const now = new Date().toISOString()
    const existing = items.find(i => i.id === assignmentId)?.submission

    if (existing?.id) {
      // UPDATE existing row by primary key (no unique constraint exists)
      await supabase
        .from('assignment_submissions')
        .update({
          status:        'submitted',
          submitted_at:  now,
          text_response: textResp || null,
          ...(fileUrl ? { file_url: fileUrl } : {}),
        })
        .eq('id', existing.id)
    } else {
      // INSERT new row
      await supabase.from('assignment_submissions').insert({
        assignment_id: assignmentId,
        student_id:    userId,
        status:        'submitted',
        submitted_at:  now,
        text_response: textResp || null,
        file_url:      fileUrl,
      })
    }

    // Optimistic update
    setItems(prev => prev.map(i =>
      i.id === assignmentId
        ? { ...i, submission: {
            ...i.submission,
            status: 'submitted',
            submitted_at: now,
            text_response: textResp || null,
            file_url: fileUrl ?? i.submission?.file_url,
          }}
        : i
    ))
    setExpanded(null)
    setSubFiles(prev => ({ ...prev, [assignmentId]: null }))
    setSubText(prev => ({ ...prev, [assignmentId]: '' }))
    setUploading(prev => ({ ...prev, [assignmentId]: false }))
  }

  const filtered = tab === 'all' ? items
    : tab === 'submitted'
      ? items.filter(i => i.submission?.status === 'submitted' || i.submission?.status === 'graded' || i.submission?.status === 'late')
      : items.filter(i => !i.submission || i.submission?.status === 'pending')

  function isOverdue(due: string) { return new Date(due) < new Date() }

  return (
    <div className={styles.page}>
      <StudentNav userId={userId} profile={profile} school={school} schoolColor={sc} />
      <div className={styles.content}>
        <DashboardHeader userId={userId} role="student" profile={profile} school={school}
          schoolColor={sc} title="Assignments" showBack />
        <main className={styles.main}>

          {/* ── Tab bar ── */}
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
                    const submitted = sub?.status === 'submitted' || sub?.status === 'graded' || sub?.status === 'late'
                    const graded    = sub?.score != null
                    const overdue   = !submitted && item.due_date && isOverdue(item.due_date)
                    const isOpen    = expanded === item.id
                    const busy      = !!uploading[item.id]
                    const chosenFile = subFiles[item.id]
                    const textVal   = subText[item.id] ?? ''

                    return (
                      <div key={item.id} className={styles.card}
                        style={{ flexDirection: 'column', gap: 10, cursor: 'default' }}>

                        {/* ── Header row ── */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%' }}>
                          <div className={styles.cardIcon}
                            style={{ background: submitted ? '#10B98120' : overdue ? '#EF444420' : sc + '20', flexShrink: 0 }}>
                            <ClipboardIcon size={16} color={submitted ? '#10B981' : overdue ? '#EF4444' : sc}/>
                          </div>

                          <div className={styles.cardBody} style={{ flex: 1, minWidth: 0 }}>
                            <p className={styles.cardTitle}>{item.title}</p>
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

                          <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: '0.65rem', fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap',
                            background: submitted ? '#10B98120' : overdue ? '#EF444420' : '#F59E0B20',
                            color:      submitted ? '#10B981'   : overdue ? '#EF4444'   : '#F59E0B' }}>
                            {submitted ? (graded ? 'Graded' : 'Submitted') : overdue ? 'Overdue' : 'Pending'}
                          </span>
                        </div>

                        {/* ── Teacher brief attachment ── */}
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

                        {/* ── Already submitted: show what they sent ── */}
                        {submitted && (
                          <div style={{ paddingLeft: 52, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {sub?.text_response && (
                              <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                                borderRadius: 10, padding: '10px 14px' }}>
                                <p style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)',
                                  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                                  Your Written Answer
                                </p>
                                <p style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.6, margin: 0 }}>
                                  {sub.text_response}
                                </p>
                              </div>
                            )}
                            {sub?.file_url && (
                              <a href={sub.file_url} target="_blank" rel="noreferrer"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.72rem',
                                  fontWeight: 600, color: '#10B981', textDecoration: 'none',
                                  padding: '5px 10px', background: '#10B98115', borderRadius: 8, alignSelf: 'flex-start' }}>
                                📤 Your Submitted File
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

                        {/* ── Submit panel (not yet submitted) ── */}
                        {!submitted && (
                          <div style={{ paddingLeft: 52 }}>
                            {!isOpen ? (
                              <button onClick={() => setExpanded(item.id)}
                                style={{ padding: '8px 20px', background: sc, color: '#fff', border: 'none',
                                  borderRadius: 999, fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
                                Submit Assignment
                              </button>
                            ) : (
                              <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                                borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

                                {/* Written answer — primary input */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)',
                                    display: 'flex', alignItems: 'center', gap: 6 }}>
                                    ✏️ Your Written Answer
                                    {!chosenFile && (
                                      <span style={{ fontSize: '0.65rem', color: '#EF4444', fontWeight: 600 }}>
                                        * required if no file
                                      </span>
                                    )}
                                  </label>
                                  <textarea
                                    rows={5}
                                    placeholder="Type your answer here... Be detailed and clear. Your teacher will read this."
                                    value={textVal}
                                    onChange={e => setSubText(prev => ({ ...prev, [item.id]: e.target.value }))}
                                    style={{ padding: '10px 14px', background: 'var(--input-bg)',
                                      border: `1.5px solid ${textVal ? sc : 'var(--input-border)'}`,
                                      borderRadius: 10, color: 'var(--text-primary)', fontSize: '0.85rem',
                                      lineHeight: 1.6, outline: 'none', resize: 'vertical',
                                      transition: 'border-color 0.2s' }}
                                  />
                                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                                    {textVal.length} characters
                                  </span>
                                </div>

                                {/* Divider */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <div style={{ flex: 1, height: 1, background: 'var(--glass-border)' }}/>
                                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                    AND / OR
                                  </span>
                                  <div style={{ flex: 1, height: 1, background: 'var(--glass-border)' }}/>
                                </div>

                                {/* File attachment */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                                    📎 Attach a File <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span>
                                  </label>
                                  <input
                                    ref={el => { fileRefs.current[item.id] = el }}
                                    type="file"
                                    accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.jpg,.jpeg,.png"
                                    style={{ display: 'none' }}
                                    onChange={e => setSubFiles(prev => ({ ...prev, [item.id]: e.target.files?.[0] ?? null }))}
                                  />
                                  <button onClick={() => fileRefs.current[item.id]?.click()}
                                    style={{ height: 44, border: `1.5px dashed ${chosenFile ? sc : 'var(--glass-border)'}`,
                                      borderRadius: 10, background: chosenFile ? sc + '10' : 'transparent',
                                      color: chosenFile ? sc : 'var(--text-muted)',
                                      fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer',
                                      transition: 'all 0.2s' }}>
                                    {chosenFile ? `✓ ${chosenFile.name}` : '+ Choose file (PDF, Word, image…)'}
                                  </button>
                                  {chosenFile && (
                                    <button onClick={() => setSubFiles(prev => ({ ...prev, [item.id]: null }))}
                                      style={{ fontSize: '0.68rem', color: '#EF4444', background: 'none',
                                        border: 'none', cursor: 'pointer', alignSelf: 'flex-start', padding: 0 }}>
                                      ✕ Remove file
                                    </button>
                                  )}
                                </div>

                                {/* Action buttons */}
                                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                  <button
                                    onClick={() => submitAssignment(item.id)}
                                    disabled={busy || (!textVal.trim() && !chosenFile)}
                                    style={{ flex: 1, height: 42, background: sc, color: '#fff', border: 'none',
                                      borderRadius: 10, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
                                      opacity: (busy || (!textVal.trim() && !chosenFile)) ? 0.5 : 1,
                                      transition: 'opacity 0.2s' }}>
                                    {busy ? 'Submitting...' : '✓ Submit'}
                                  </button>
                                  <button onClick={() => { setExpanded(null) }}
                                    style={{ height: 42, padding: '0 18px', background: 'transparent',
                                      border: '1px solid var(--glass-border)', borderRadius: 10,
                                      color: 'var(--text-muted)', fontSize: '0.82rem', cursor: 'pointer' }}>
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
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
