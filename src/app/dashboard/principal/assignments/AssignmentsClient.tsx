'use client'
// src/app/dashboard/principal/assignments/AssignmentsClient.tsx
//
// FIX: this file filtered/wrote assignments.class_level (a display string)
// instead of assignments.class_id (the real FK), and referenced a
// teacher_name column that doesn't exist on assignments — teacher identity
// is via teacher_id/created_by/posted_by → profiles.full_name, confirmed
// against the teacher grading pages and parent/student assignment fixes.
//
// ADDED: a school-wide overview — for each assignment, a per-class
// breakdown of how many students have submitted/been graded vs. the total
// roster for that class (profiles.class_id), so the principal can see
// completion at a glance without opening every teacher's gradebook.

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import styles from './assignments.module.css'

type Status = 'active' | 'draft' | 'closed'
const STATUS_COLOR: Record<Status, string> = { active: '#10B981', draft: '#F59E0B', closed: '#6B7280' }

interface Props { profile: any; school: any; userId: string }

export default function AssignmentsClient({ profile, school, userId }: Props) {
  const supabase = createClient()
  const sc = school?.primary_color ?? '#7C3AED'
  const [assignments, setAssignments] = useState<any[]>([])
  const [classes,     setClasses]     = useState<any[]>([])
  const [classRoster,  setClassRoster] = useState<Record<string, number>>({})
  const [submissions,  setSubmissions] = useState<any[]>([])
  const [subsError,    setSubsError]   = useState<string | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [showForm,    setShowForm]    = useState(false)
  const [confirmDel,  setConfirmDel]  = useState<any | null>(null)
  const [deleting,    setDeleting]    = useState<string | null>(null)
  const [saving,      setSaving]      = useState(false)
  const [toast,       setToast]       = useState<{ msg: string; ok: boolean } | null>(null)
  const [filter,      setFilter]      = useState<Status | ''>('')
  const [expanded,    setExpanded]    = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '', description: '', subject: '', class_id: '',
    due_date: '', max_score: '100', status: 'active' as Status,
  })

  useEffect(() => { load() }, [])

  async function load() {
    if (!school?.id) { setLoading(false); return }

    const [{ data: asgn }, { data: cls }] = await Promise.all([
      supabase.from('assignments')
        .select(`
          id, title, description, subject, class_id, due_date, max_score, status, created_at,
          teacher_id, created_by, posted_by,
          classes ( id, name ),
          teacher:profiles!teacher_id ( full_name )
        `)
        .eq('school_id', school.id)
        .order('created_at', { ascending: false })
        .limit(60),
      supabase.from('classes').select('id, name').eq('school_id', school.id).order('name'),
    ])

    if (asgn) setAssignments(asgn)
    if (cls)  setClasses(cls)

    // Total roster size per class, for "X of Y submitted"
    if (cls && cls.length > 0) {
      const { data: roster } = await supabase
        .from('profiles')
        .select('class_id')
        .eq('school_id', school.id)
        .eq('role', 'student')
        .in('class_id', cls.map((c: any) => c.id))

      const counts: Record<string, number> = {}
      roster?.forEach((r: any) => { counts[r.class_id] = (counts[r.class_id] ?? 0) + 1 })
      setClassRoster(counts)
    }

    // All submissions for this school's assignments, for the per-class breakdown
    if (asgn && asgn.length > 0) {
      const { data: subs, error: subsErr } = await supabase
        .from('assignment_submissions')
        .select('id, assignment_id, student_id, status, score, student:profiles!student_id(full_name, class_id)')
        .in('assignment_id', asgn.map((a: any) => a.id))

      if (subsErr) {
        console.error('[principal assignments] submissions load error:', subsErr.message)
        setSubsError(subsErr.message)
      } else {
        setSubsError(null)
      }
      setSubmissions(subs ?? [])
    }

    setLoading(false)
  }

  function showToast(msg: string, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000) }

  async function handleCreate() {
    if (!form.title.trim() || !form.class_id) {
      showToast('Title and class are required', false)
      return
    }
    setSaving(true)
    const { data, error } = await supabase.from('assignments').insert({
      title:       form.title.trim(),
      description: form.description.trim() || null,
      subject:     form.subject.trim() || null,
      class_id:    form.class_id,
      due_date:    form.due_date || null,
      max_score:   parseInt(form.max_score) || 100,
      status:      form.status,
      school_id:   school.id,
      created_by:  userId,
    }).select('*, classes(id, name)').single()
    setSaving(false)
    if (error) { showToast(error.message, false); return }
    setAssignments(prev => [data, ...prev])
    setForm({ title:'', description:'', subject:'', class_id:'', due_date:'', max_score:'100', status:'active' })
    setShowForm(false)
    showToast('Assignment created')
  }

  async function handleDelete(asgn: any) {
    setDeleting(asgn.id)
    const { error } = await supabase.from('assignments').delete().eq('id', asgn.id)
    setDeleting(null); setConfirmDel(null)
    if (error) { showToast('Failed to delete', false); return }
    setAssignments(prev => prev.filter(a => a.id !== asgn.id))
    showToast('Assignment deleted')
  }

  async function toggleStatus(asgn: any) {
    const next: Status = asgn.status === 'active' ? 'closed' : asgn.status === 'closed' ? 'draft' : 'active'
    await supabase.from('assignments').update({ status: next }).eq('id', asgn.id)
    setAssignments(prev => prev.map(a => a.id === asgn.id ? { ...a, status: next } : a))
  }

  const filtered = filter ? assignments.filter(a => a.status === filter) : assignments

  function relTime(iso: string) {
    if (!iso) return ''
    const d = new Date(iso)
    const now = new Date()
    const diff = d.getTime() - now.getTime()
    if (diff < 0) return 'Overdue'
    const days = Math.ceil(diff / 86400000)
    if (days === 0) return 'Due today'
    if (days === 1) return 'Due tomorrow'
    return `Due in ${days}d`
  }

  return (
    <RolePageWrapper userId={userId} role="principal" profile={profile} school={school} title="Assignments">
      {subsError && (
        <div style={{ padding: '10px 14px', background: '#EF444415', border: '1px solid #EF444440',
          borderRadius: 8, marginBottom: 16, fontSize: '0.78rem', color: '#EF4444', fontFamily: 'monospace' }}>
          ⚠️ Submissions query failed: {subsError}
        </div>
      )}
      {toast && (
        <div className={`${styles.toast} ${toast.ok ? styles.toastOk : styles.toastErr}`}>
          {toast.ok ? '✓' : '✕'} {toast.msg}
        </div>
      )}

      {confirmDel && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <h3 className={styles.dialogTitle}>Delete Assignment?</h3>
            <p className={styles.dialogBody}>"{confirmDel.title}" will be permanently removed.</p>
            <div className={styles.dialogActions}>
              <button className={styles.cancelBtn} onClick={() => setConfirmDel(null)}>Cancel</button>
              <button className={styles.deleteBtn} onClick={() => handleDelete(confirmDel)} disabled={deleting === confirmDel.id}>
                {deleting === confirmDel.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.container}>
        {/* Stats */}
        <div className={styles.statsRow}>
          {(['active','draft','closed'] as Status[]).map(s => (
            <div key={s} className={styles.statCard}>
              <p className={styles.statVal} style={{ color: STATUS_COLOR[s] }}>{assignments.filter(a => a.status === s).length}</p>
              <p className={styles.statLbl} style={{ textTransform:'capitalize' }}>{s}</p>
            </div>
          ))}
          <div className={styles.statCard}>
            <p className={styles.statVal} style={{ color: '#EF4444' }}>
              {assignments.filter(a => a.due_date && new Date(a.due_date) < new Date() && a.status === 'active').length}
            </p>
            <p className={styles.statLbl}>Overdue</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className={styles.toolbar}>
          <div className={styles.filterTabs}>
            {(['','active','draft','closed'] as const).map(s => (
              <button
                key={s}
                className={`${styles.filterTab} ${filter === s ? styles.filterTabActive : ''}`}
                style={filter === s && s ? { borderColor: STATUS_COLOR[s as Status], color: STATUS_COLOR[s as Status] } : {}}
                onClick={() => setFilter(s as any)}
              >
                {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <button className={styles.addBtn} style={{ background: sc }} onClick={() => setShowForm(v => !v)}>
            {showForm ? '✕ Close' : '+ New Assignment'}
          </button>
        </div>

        {/* Create form */}
        {showForm && (
          <div className={styles.formCard}>
            <p className={styles.formTitle}>Create New Assignment</p>
            <div className={styles.formGrid}>
              <div className={`${styles.fieldGroup} ${styles.fullWidth}`}>
                <label className={styles.fieldLabel}>Title *</label>
                <input className={styles.fieldInput} placeholder="e.g. Chapter 5 Essay" value={form.title} onChange={e => setForm(f=>({...f,title:e.target.value}))}/>
              </div>
              <div className={`${styles.fieldGroup} ${styles.fullWidth}`}>
                <label className={styles.fieldLabel}>Description</label>
                <textarea className={`${styles.fieldInput} ${styles.textarea}`} rows={3} placeholder="Assignment instructions…" value={form.description} onChange={e => setForm(f=>({...f,description:e.target.value}))}/>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Subject</label>
                <input className={styles.fieldInput} placeholder="e.g. English Language" value={form.subject} onChange={e => setForm(f=>({...f,subject:e.target.value}))}/>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Class</label>
                <select className={styles.fieldInput} value={form.class_id} onChange={e => setForm(f=>({...f,class_id:e.target.value}))}>
                  <option value="">Select a class…</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Due Date</label>
                <input className={styles.fieldInput} type="datetime-local" value={form.due_date} onChange={e => setForm(f=>({...f,due_date:e.target.value}))}/>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Max Score</label>
                <input className={styles.fieldInput} type="number" min={1} max={1000} value={form.max_score} onChange={e => setForm(f=>({...f,max_score:e.target.value}))}/>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Status</label>
                <select className={styles.fieldInput} value={form.status} onChange={e => setForm(f=>({...f,status:e.target.value as Status}))}>
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                </select>
              </div>
            </div>
            <div className={styles.formActions}>
              <button className={styles.cancelFormBtn} onClick={() => setShowForm(false)}>Cancel</button>
              <button className={styles.saveBtn} style={{ background: sc }} onClick={handleCreate} disabled={saving || !form.title.trim()}>
                {saving ? 'Creating…' : 'Create Assignment'}
              </button>
            </div>
          </div>
        )}

        {/* Assignments list */}
        {loading ? (
          <div className={styles.loadingList}>{[1,2,3].map(i => <div key={i} className={styles.skeleton}/>)}</div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            <p>{filter ? `No ${filter} assignments` : 'No assignments yet'}</p>
          </div>
        ) : (
          <div className={styles.assignmentList}>
            {filtered.map(asgn => {
              const sc2 = STATUS_COLOR[asgn.status as Status] ?? '#6B7280'
              const overdue = asgn.due_date && new Date(asgn.due_date) < new Date() && asgn.status === 'active'
              return (
                <div key={asgn.id} className={`${styles.assignmentCard} ${overdue ? styles.overdueCard : ''}`}
                  style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex' }}>
                    <div className={styles.cardLeft} onClick={() => setExpanded(expanded === asgn.id ? null : asgn.id)} style={{ cursor: 'pointer', flex: 1 }}>
                      <div className={styles.cardTop}>
                        <span className={styles.statusPill} style={{ background: sc2 + '20', color: sc2 }}>{asgn.status}</span>
                        {asgn.subject && <span className={styles.subjectTag}>{asgn.subject}</span>}
                        {asgn.classes?.name && <span className={styles.classTag}>{asgn.classes.name}</span>}
                      </div>
                      <h3 className={styles.assignmentTitle}>{asgn.title}</h3>
                      {asgn.description && <p className={styles.assignmentDesc}>{asgn.description}</p>}
                      <div className={styles.cardMeta}>
                        {asgn.due_date && (
                          <span className={`${styles.dueDate} ${overdue ? styles.dueDateOverdue : ''}`}>
                            📅 {relTime(asgn.due_date)} · {new Date(asgn.due_date).toLocaleDateString('en-NG',{day:'numeric',month:'short'})}
                          </span>
                        )}
                        {asgn.max_score && <span className={styles.scoreTag}>/{asgn.max_score} pts</span>}
                        {asgn.teacher?.full_name && <span className={styles.teacherTag}>👤 {asgn.teacher.full_name}</span>}
                      </div>

                      {/* Submission completion bar */}
                      {(() => {
                        const total = classRoster[asgn.class_id] ?? 0
                        const subs  = submissions.filter(s => s.assignment_id === asgn.id)
                        const done  = subs.length
                        const pct   = total > 0 ? Math.round((done / total) * 100) : 0
                        return total > 0 ? (
                          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--glass-border)', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#10B981' : sc, transition: 'width 0.2s' }}/>
                            </div>
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                              {done}/{total} submitted
                            </span>
                          </div>
                        ) : null
                      })()}
                    </div>
                    <div className={styles.cardActions}>
                      <button
                        className={styles.statusToggle}
                        onClick={() => toggleStatus(asgn)}
                        title={`Change status (currently ${asgn.status})`}
                        style={{ color: sc2 }}
                      >
                        ↻
                      </button>
                      <button className={styles.delBtn} onClick={() => setConfirmDel(asgn)} title="Delete">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
                      </button>
                    </div>
                  </div>

                  {/* Expandable: every student's submission status for this assignment */}
                  {expanded === asgn.id && (
                    <div style={{ borderTop: '1px solid var(--glass-border)',
                      marginTop: 10, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(() => {
                        const subs = submissions.filter(s => s.assignment_id === asgn.id)
                        if (subs.length === 0) {
                          return <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                            No submissions yet for {asgn.classes?.name ?? 'this class'}.
                          </p>
                        }
                        return subs.map((s: any) => (
                          <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '6px 10px', background: 'var(--glass-bg)', borderRadius: 8 }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                              {s.student?.full_name ?? 'Unknown student'}
                            </span>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700,
                              color: s.status === 'graded' ? '#10B981' : '#F59E0B' }}>
                              {s.status === 'graded' ? `${s.score}/${asgn.max_score}` : s.status ?? 'submitted'}
                            </span>
                          </div>
                        ))
                      })()}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <div style={{ height: 100 }}/>
      </div>
    </RolePageWrapper>
  )
}
