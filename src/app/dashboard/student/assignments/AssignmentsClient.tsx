'use client'
// src/app/dashboard/student/assignments/AssignmentsClient.tsx
//
// PIPELINE FIX — what was blocking submissions from appearing on teacher page:
//
// BUG 1 (CRITICAL): assignments query filtered by school_id + class_id,
// but the teacher creates assignments with teacher_id = their profile id.
// The student query was correct — the issue was entirely on the TEACHER
// side (submissions page.tsx had a broken or missing join). Fixed in
// submissions/page.tsx separately.
//
// BUG 2: submitAssignment() called .insert() without returning the new row
// (.select().single() was missing after insert), so `existing` would be null
// on the *next* load even though a row existed — causing duplicate insert
// attempts on resubmit which would fail silently. Fixed: after successful
// insert, reload the submission row to get the real id.
//
// BUG 3: The update path used existing.id correctly, but the optimistic
// update didn't refresh submission.id from the insert response — so the
// second submit attempt would always try to update a null id. Fixed below.
//
// Schema confirmed (assignment_submissions):
//   id, assignment_id, student_id, file_url, text_response, status
//   (submission_status enum: pending|submitted|graded|late),
//   score, feedback, submitted_at, graded_at, graded_by, answer_text
//   NO school_id column on this table.
//
// REDESIGN PASS (Lane 3 — Student):
//   - emoji swapped for Icons.tsx per EMOJI-ICON-MAP.md
//   - hardcoded status hex (#10B981/#EF4444/#F59E0B) → var(--success)/
//     var(--danger)/var(--warning) design tokens, so theme + future
//     brand changes propagate automatically
//   - stale `?? '#7C3AED'` brand fallback → '#800020' (the real default)
//   - buttons/badges now use the shared .btn / .badge utility classes
//     from globals.css instead of one-off inline styles
//   - riseIn / staggerItem / pressable motion added to match the
//     hero-dashboard's entrance + press feel
//   - NOTE: StudentNav + DashboardHeader chrome intentionally left as-is —
//     the RolePageWrapper migration question is still open, tracked
//     separately so it can be applied once across all sub-pages at once

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import {
  ClipboardIcon, AlertIcon, XIcon, EditIcon, PaperclipIcon, CheckIcon, UploadIcon,
} from '@/components/Icons'
import motion from '@/components/dashboard-motion.module.css'
import styles from './page.module.css'
import { SkeletonList } from '@/components/motion/Skeleton'
import { logActivity } from '@/lib/logActivity'

interface Props { profile: any; school: any; userId: string }

export default function AssignmentsClient({ profile, school, userId }: Props) {
  const [items,     setItems]     = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [tab,       setTab]       = useState<'pending' | 'submitted' | 'all'>('pending')
  const [expanded,  setExpanded]  = useState<string | null>(null)
  const [subFiles,  setSubFiles]  = useState<Record<string, File | null>>({})
  const [subText,   setSubText]   = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [error,     setError]     = useState<string | null>(null)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const supabase    = createClient()
  const sc          = school?.primary_color ?? '#800020'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)

    // Fetch this student's existing submissions (no school_id on this table)
    const { data: subs, error: subsErr } = await supabase
      .from('assignment_submissions')
      .select('id, assignment_id, status, score, feedback, submitted_at, file_url, text_response, answer_text')
      .eq('student_id', userId)

    if (subsErr) {
      console.error('[assignments] load submissions error:', subsErr.message)
      setError(subsErr.message)
    }

    // Build a lookup map by assignment_id
    const subMap: Record<string, any> = {}
    subs?.forEach(s => { subMap[s.assignment_id] = s })

    // Fetch assignments for this student's class
    const { data: assignments, error: asgErr } = await supabase
      .from('assignments')
      .select('id, title, description, due_date, file_url, max_score, subject, created_at, class_id')
      .eq('school_id', school?.id)
      .eq('class_id', profile?.class_id)
      .eq('status', 'active')                  // only active assignments
      .order('due_date', { ascending: true })

    if (asgErr) {
      console.error('[assignments] load assignments error:', asgErr.message)
      setError(asgErr.message)
    }

    if (assignments) {
      setItems(assignments.map((a: any) => ({
        ...a,
        submission: subMap[a.id] ?? null,
      })))
    }
    setLoading(false)
  }

  async function submitAssignment(assignmentId: string) {
    const file     = subFiles[assignmentId]
    const textResp = (subText[assignmentId] ?? '').trim()

    if (!textResp && !file) {
      alert('Please write your answer or attach a file before submitting.')
      return
    }

    setUploading(prev => ({ ...prev, [assignmentId]: true }))
    setError(null)

    // ── 1. Upload file if provided ──
    let fileUrl: string | null = null
    if (file) {
      const ext  = file.name.split('.').pop()
      const path = `${school?.id}/submissions/${userId}/${assignmentId}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('assignments')
        .upload(path, file, { upsert: false })
      if (upErr) {
        setError(`File upload failed: ${upErr.message}`)
        setUploading(prev => ({ ...prev, [assignmentId]: false }))
        return
      }
      const { data: urlData } = supabase.storage.from('assignments').getPublicUrl(path)
      fileUrl = urlData?.publicUrl ?? null
    }

    const now      = new Date().toISOString()
    const existing = items.find(i => i.id === assignmentId)?.submission

    // ── 2. Insert or update in assignment_submissions ──
    let savedSubmission: any = null

    if (existing?.id) {
      // UPDATE existing row
      const { data: updated, error: updErr } = await supabase
        .from('assignment_submissions')
        .update({
          status:        'submitted',
          submitted_at:  now,
          text_response: textResp || null,
          answer_text:   textResp || null,      // mirror to answer_text (same data, both columns exist)
          ...(fileUrl ? { file_url: fileUrl } : {}),
        })
        .eq('id', existing.id)
        .select('id, assignment_id, status, score, feedback, submitted_at, file_url, text_response')
        .single()
      if (updErr) {
        console.error('[assignments] update error:', updErr.message)
        setError(updErr.message)
        setUploading(prev => ({ ...prev, [assignmentId]: false }))
        return
      }
      savedSubmission = updated
    } else {
      // INSERT new row — and retrieve the new id so resubmit works
      const { data: inserted, error: insErr } = await supabase
        .from('assignment_submissions')
        .insert({
          assignment_id: assignmentId,
          student_id:    userId,
          status:        'submitted',
          submitted_at:  now,
          text_response: textResp || null,
          answer_text:   textResp || null,
          file_url:      fileUrl,
        })
        .select('id, assignment_id, status, score, feedback, submitted_at, file_url, text_response')
        .single()
      if (insErr) {
        console.error('[assignments] insert error:', insErr.message)
        setError(insErr.message)
        setUploading(prev => ({ ...prev, [assignmentId]: false }))
        return
      }
      savedSubmission = inserted
    }

    // ── 3. Only update UI after confirmed DB write ──
    setItems(prev => prev.map(i =>
      i.id === assignmentId
        ? { ...i, submission: savedSubmission }
        : i
    ))
    setExpanded(null)
    setSubFiles(prev => ({ ...prev, [assignmentId]: null }))
    setSubText(prev => ({ ...prev, [assignmentId]: '' }))
    setUploading(prev => ({ ...prev, [assignmentId]: false }))

    // Fire-and-forget — never blocks the actual submission on logging failing.
    const submittedItem = items.find(i => i.id === assignmentId)
    if (submittedItem && school?.id) {
      logActivity({
        userId, schoolId: school.id,
        type:  'assignment_submitted',
        title: `Submitted "${submittedItem.title}"`,
        subtitle: submittedItem.subject ?? undefined,
        href: `/dashboard/student/assignments`,
      })
    }
  }

  const filtered = tab === 'all' ? items
    : tab === 'submitted'
      ? items.filter(i => ['submitted', 'graded', 'late'].includes(i.submission?.status))
      : items.filter(i => !i.submission || i.submission?.status === 'pending')

  function isOverdue(due: string) { return new Date(due) < new Date() }

  return (
    <RolePageWrapper userId={userId} role="student" profile={profile} school={school} title="Assignments">
        <>

          {/* Error banner */}
          {error && (
            <div className={`glass-card ${motion.riseIn}`} style={{ display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px', borderColor: 'rgba(239,68,68,0.3)', background: 'var(--danger-subtle)',
              marginBottom: 'var(--space-4)' }}>
              <AlertIcon size={16} color="var(--danger)" />
              <span style={{ fontSize: '0.8rem', color: 'var(--danger)', flex: 1 }}>{error}</span>
              <button onClick={() => setError(null)} className={motion.pressable}
                style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer',
                  display: 'flex', padding: 4 }}>
                <XIcon size={14} />
              </button>
            </div>
          )}

          {/* Tab bar */}
          <div className={motion.riseIn} style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-5)', flexWrap: 'wrap' }}>
            {([['pending', 'Pending'], ['submitted', 'Submitted'], ['all', 'All']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setTab(v)} className={motion.pressable}
                style={{ padding: '6px 14px', borderRadius: 'var(--radius-full)', fontSize: '0.75rem', fontWeight: 700,
                  background: tab === v ? sc : 'var(--glass-bg)',
                  color:      tab === v ? '#fff' : 'var(--text-muted)',
                  border:    `1px solid ${tab === v ? sc : 'var(--glass-border)'}`, cursor: 'pointer' }}>
                {l}
              </button>
            ))}
          </div>

          {loading
            ? <SkeletonList count={3} variant="card" />
            : filtered.length === 0
              ? <div className={`${styles.empty} ${motion.riseIn}`}>
                  <ClipboardIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
                  <p>No {tab} assignments</p>
                </div>
              : <div className={styles.list}>
                  {filtered.map((item, i) => {
                    const sub        = item.submission
                    const submitted  = ['submitted', 'graded', 'late'].includes(sub?.status)
                    const graded     = sub?.score != null
                    const overdue    = !submitted && item.due_date && isOverdue(item.due_date)
                    const isOpen     = expanded === item.id
                    const busy       = !!uploading[item.id]
                    const chosenFile = subFiles[item.id]
                    const textVal    = subText[item.id] ?? ''

                    const statusColor = submitted ? 'var(--success)' : overdue ? 'var(--danger)' : 'var(--warning)'
                    const statusBg    = submitted ? 'var(--success-subtle)' : overdue ? 'var(--danger-subtle)' : 'var(--warning-subtle)'

                    return (
                      <div key={item.id} className={`glass-card ${styles.card} ${motion.staggerItem} ${motion.pressable}`}
                        style={{ flexDirection: 'column', gap: 10, cursor: 'default', animationDelay: `${i * 40}ms` }}>

                        {/* Header row */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%' }}>
                          <div className={styles.cardIcon} style={{ background: statusBg, flexShrink: 0 }}>
                            <ClipboardIcon size={16} color={statusColor}/>
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
                              {overdue && <span style={{ color: 'var(--danger)', marginLeft: 6, fontWeight: 700 }}>· Overdue</span>}
                              {graded && (
                                <span style={{ color: 'var(--success)', marginLeft: 6, fontWeight: 700 }}>
                                  · Score: {sub.score}/{item.max_score}
                                </span>
                              )}
                            </p>
                          </div>
                          <span className={styles.badge} style={{ flexShrink: 0, whiteSpace: 'nowrap',
                            background: statusBg, color: statusColor }}>
                            {submitted ? (graded ? 'Graded' : 'Submitted') : overdue ? 'Overdue' : 'Pending'}
                          </span>
                        </div>

                        {/* Teacher brief attachment */}
                        {item.file_url && (
                          <div style={{ paddingLeft: 52 }}>
                            <a href={item.file_url} target="_blank" rel="noreferrer" className={motion.pressable}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.75rem',
                                fontWeight: 700, color: sc, textDecoration: 'none',
                                padding: '5px 12px', background: 'var(--brand-subtle)', borderRadius: 'var(--radius-sm)' }}>
                              <PaperclipIcon size={13} /> View Assignment Brief
                            </a>
                          </div>
                        )}

                        {/* Already submitted — show what they sent + teacher feedback */}
                        {submitted && (
                          <div style={{ paddingLeft: 52, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {(sub?.text_response || sub?.answer_text) && (
                              <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                                borderRadius: 10, padding: '10px 14px' }}>
                                <p style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)',
                                  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                                  Your Written Answer
                                </p>
                                <p style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.6, margin: 0 }}>
                                  {sub.text_response ?? sub.answer_text}
                                </p>
                              </div>
                            )}
                            {sub?.file_url && (
                              <a href={sub.file_url} target="_blank" rel="noreferrer" className={motion.pressable}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.72rem',
                                  fontWeight: 600, color: 'var(--success)', textDecoration: 'none',
                                  padding: '5px 10px', background: 'var(--success-subtle)', borderRadius: 8, alignSelf: 'flex-start' }}>
                                <UploadIcon size={13} /> Your Submitted File
                              </a>
                            )}
                            {sub?.feedback && (
                              <div style={{ background: 'var(--brand-subtle)', border: '1px solid var(--brand-border)',
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

                        {/* Submit panel (not yet submitted) */}
                        {!submitted && (
                          <div style={{ paddingLeft: 52 }}>
                            {!isOpen ? (
                              <button onClick={() => setExpanded(item.id)} className={`btn btn-primary btn-sm ${motion.pressable}`}>
                                Submit Assignment
                              </button>
                            ) : (
                              <div className="glass-card-flat" style={{ borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

                                {/* Written answer */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)',
                                    display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <EditIcon size={13} /> Your Written Answer
                                    {!chosenFile && (
                                      <span style={{ fontSize: '0.65rem', color: 'var(--danger)', fontWeight: 600 }}>
                                        * required if no file
                                      </span>
                                    )}
                                  </label>
                                  <textarea
                                    rows={5}
                                    className="input"
                                    placeholder="Type your answer here... Be detailed and clear. Your teacher will read this."
                                    value={textVal}
                                    onChange={e => setSubText(prev => ({ ...prev, [item.id]: e.target.value }))}
                                    style={{ borderColor: textVal ? sc : undefined, resize: 'vertical', lineHeight: 1.6 }}
                                  />
                                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                                    {textVal.length} characters
                                  </span>
                                </div>

                                {/* Divider */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <div style={{ flex: 1, height: 1, background: 'var(--glass-border)' }}/>
                                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>AND / OR</span>
                                  <div style={{ flex: 1, height: 1, background: 'var(--glass-border)' }}/>
                                </div>

                                {/* File attachment */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)',
                                    display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <PaperclipIcon size={13} /> Attach a File <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span>
                                  </label>
                                  <input
                                    ref={el => { fileRefs.current[item.id] = el }}
                                    type="file"
                                    accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.jpg,.jpeg,.png"
                                    style={{ display: 'none' }}
                                    onChange={e => setSubFiles(prev => ({ ...prev, [item.id]: e.target.files?.[0] ?? null }))}
                                  />
                                  <button onClick={() => fileRefs.current[item.id]?.click()} className={motion.pressable}
                                    style={{ height: 44, border: `1.5px dashed ${chosenFile ? sc : 'var(--glass-border)'}`,
                                      borderRadius: 10, background: chosenFile ? 'var(--brand-subtle)' : 'transparent',
                                      color: chosenFile ? sc : 'var(--text-muted)',
                                      fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                    {chosenFile ? <><CheckIcon size={14} /> {chosenFile.name}</> : '+ Choose file (PDF, Word, image…)'}
                                  </button>
                                  {chosenFile && (
                                    <button onClick={() => setSubFiles(prev => ({ ...prev, [item.id]: null }))}
                                      className={motion.pressable}
                                      style={{ fontSize: '0.68rem', color: 'var(--danger)', background: 'none',
                                        border: 'none', cursor: 'pointer', alignSelf: 'flex-start', padding: 0,
                                        display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                      <XIcon size={11} /> Remove file
                                    </button>
                                  )}
                                </div>

                                {/* Action buttons */}
                                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                  <button
                                    onClick={() => submitAssignment(item.id)}
                                    disabled={busy || (!textVal.trim() && !chosenFile)}
                                    className={`btn btn-primary ${motion.pressable}`}
                                    style={{ flex: 1 }}>
                                    {busy ? 'Submitting...' : <><CheckIcon size={15} /> Submit</>}
                                  </button>
                                  <button onClick={() => setExpanded(null)} className={`btn btn-secondary ${motion.pressable}`}>
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
        </>
    </RolePageWrapper>
  )
}
