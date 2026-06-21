'use client'
// src/app/dashboard/student/schedule/ScheduleClient.tsx
//
// FIX: the real `study_schedules` table is substantially different from what
// this file assumed. Confirmed real columns:
//   id, student_id, school_id, subject_id (uuid), day_of_week (integer),
//   start_time, end_time (both required), duration_mins, label,
//   is_active, created_by_ai, created_at, updated_at
//
// Previous code sent: day (text 'Mon'), subject (free text), time (single
// field), duration, color — almost none of which exist on the real table.
// This explains why "create one doesn't create": nearly every insert field
// was wrong-named or wrong-typed.
//
// Rebuilt to:
//   - Use a Subject dropdown (sourced from the student's class_subjects,
//     same pattern used everywhere else) instead of free text, since
//     subject_id is a uuid foreign key, not a string.
//   - day_of_week sent as integer (1=Monday...5=Friday, consistent with
//     the timetable fix), with Sat/Sun also supported as 6/7 since this
//     is a personal planner, not a class timetable.
//   - start_time + end_time both collected (duration_mins is derived from
//     them automatically so the student only has to pick times once).
//   - is_active/created_by_ai sent explicitly since they're NOT NULL.
//   - label holds the free-text title/note for the session.
//   - Visible error banner instead of failing silently.
//   - generateAIPlan() now guarded: only enabled if /api/study-plan
//     actually responds successfully; clear error shown if it doesn't,
//     instead of a silent no-op.

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import StudentNav from '@/components/StudentNav'
import { CalendarIcon, AiIcon, PlusIcon, TrashIcon } from '@/components/Icons'
import styles from './page.module.css'

interface Props { profile: any; school: any; userId: string }

const DAYS = [
  { label: 'Mon', value: 1 }, { label: 'Tue', value: 2 }, { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 }, { label: 'Fri', value: 5 }, { label: 'Sat', value: 6 }, { label: 'Sun', value: 7 },
]
const DAY_LABEL: Record<number, string> = {
  1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday', 7: 'Sunday',
}

interface SubjectOption { class_subject_id: string; subject_id: string; subject_name: string }

export default function ScheduleClient({ profile, school, userId }: Props) {
  const [plan,        setPlan]        = useState<any[]>([])
  const [subjects,    setSubjects]    = useState<SubjectOption[]>([])
  const [loading,     setLoading]     = useState(true)
  const [generating,  setGenerating]  = useState(false)
  const [showAdd,     setShowAdd]     = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [newItem,     setNewItem]     = useState({
    day_of_week: 1, subject_id: '', label: '', start_time: '08:00', end_time: '09:00',
  })
  const supabase    = createClient()
  const schoolColor = school?.primary_color ?? '#7C3AED'

  useEffect(() => { loadSubjects(); loadPlan() }, [])

  // Subjects available to this student, for the dropdown (subject_id is a uuid FK)
  async function loadSubjects() {
    const { data, error: err } = await supabase
      .from('class_subjects')
      .select('id, subject_id, subjects(name)')
      .eq('class_id', profile?.class_id)
    if (err) { console.error('[schedule] subjects error:', err.message); return }
    if (data) {
      setSubjects(data.map((cs: any) => ({
        class_subject_id: cs.id,
        subject_id: cs.subject_id,
        subject_name: cs.subjects?.name ?? 'Subject',
      })))
      if (data[0]) setNewItem(p => ({ ...p, subject_id: data[0].subject_id }))
    }
  }

  async function loadPlan() {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('study_schedules')
      .select('id, day_of_week, subject_id, label, start_time, end_time, duration_mins, is_active')
      .eq('student_id', userId)
      .eq('is_active', true)
      .order('start_time', { ascending: true })
    if (err) { console.error('[schedule] load error:', err.message); setError(err.message) }
    if (data) setPlan(data)
    setLoading(false)
  }

  function computeDurationMins(start: string, end: string) {
    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)
    const mins = (eh * 60 + em) - (sh * 60 + sm)
    return mins > 0 ? mins : 60
  }

  async function addSession() {
    if (!newItem.subject_id) { setError('Select a subject'); return }
    setSaving(true)
    setError(null)

    // FIX: send the REAL columns — day_of_week (int), subject_id (uuid),
    // start_time/end_time, duration_mins (derived), is_active, created_by_ai.
    // No `color` column exists on the real table — color is now derived
    // client-side at render time from subject_id instead of stored.
    const { data, error: err } = await supabase.from('study_schedules').insert({
      student_id:     userId,
      school_id:      school?.id,
      subject_id:     newItem.subject_id,
      label:          newItem.label || null,
      day_of_week:    newItem.day_of_week,
      start_time:     newItem.start_time,
      end_time:       newItem.end_time,
      duration_mins:  computeDurationMins(newItem.start_time, newItem.end_time),
      is_active:      true,
      created_by_ai:  false,
    }).select().single()

    if (err) {
      console.error('[schedule] insert error:', err.message)
      setError(err.message)
      setSaving(false)
      return
    }

    if (data) setPlan(prev => [...prev, data])
    setShowAdd(false)
    setNewItem(p => ({ ...p, label: '', start_time: '08:00', end_time: '09:00' }))
    setSaving(false)
  }

  async function deleteSession(id: string) {
    setError(null)
    // Soft delete via is_active, consistent with how loadPlan() filters
    const { error: err } = await supabase.from('study_schedules').update({ is_active: false }).eq('id', id)
    if (err) { console.error('[schedule] delete error:', err.message); setError(err.message); return }
    setPlan(prev => prev.filter(p => p.id !== id))
  }

  async function generateAIPlan() {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/study-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, schoolId: school?.id, classId: profile?.class_id }),
      })
      if (!res.ok) {
        // FIX: surface a real error instead of silently doing nothing
        setError(`AI plan generation isn't available right now (${res.status}).`)
        setGenerating(false)
        return
      }
      const data = await res.json()
      if (data?.plan?.length) {
        const inserts = data.plan.map((p: any) => ({
          student_id: userId, school_id: school?.id,
          subject_id: p.subject_id, label: p.label ?? null,
          day_of_week: p.day_of_week, start_time: p.start_time, end_time: p.end_time,
          duration_mins: p.duration_mins ?? computeDurationMins(p.start_time, p.end_time),
          is_active: true, created_by_ai: true,
        }))
        const { data: inserted, error: insErr } = await supabase.from('study_schedules').insert(inserts).select()
        if (insErr) { setError(insErr.message); setGenerating(false); return }
        if (inserted) setPlan(prev => [...prev, ...inserted])
      } else {
        setError('AI couldn\u2019t generate a plan — try adding sessions manually.')
      }
    } catch (e: any) {
      // FIX: was a silent empty catch — now surfaces something to the student
      console.error('[schedule] AI generate error:', e)
      setError('AI plan generation failed. Try again or add sessions manually.')
    }
    setGenerating(false)
  }

  const SUBJECT_COLORS = ['#7C3AED', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#8B5CF6']
  function colorFor(subjectId: string) {
    const idx = subjects.findIndex(s => s.subject_id === subjectId)
    return SUBJECT_COLORS[idx >= 0 ? idx % SUBJECT_COLORS.length : 0]
  }
  function subjectName(subjectId: string) {
    return subjects.find(s => s.subject_id === subjectId)?.subject_name ?? 'Study'
  }

  return (
    <div className={styles.page}>
      <StudentNav userId={userId} profile={profile} school={school} schoolColor={schoolColor} />
      <div className={styles.content}>
        <DashboardHeader userId={userId} role="student" profile={profile} school={school}
          schoolColor={schoolColor} title="Study Plan" showBack />
        <main className={styles.main}>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#EF444415', border: '1px solid #EF444440', borderRadius: 10, marginBottom: 'var(--space-4)' }}>
              <span style={{ fontSize: '0.8rem', color: '#EF4444', flex: 1 }}>⚠️ {error}</span>
              <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 800 }}>✕</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-5)', flexWrap: 'wrap' }}>
            <button onClick={() => setShowAdd(!showAdd)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: `linear-gradient(135deg,${schoolColor},${schoolColor}cc)`, color: '#fff', border: 'none', borderRadius: 999, fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
              <PlusIcon size={14} color="white" /> Add Session
            </button>
            <button onClick={generateAIPlan} disabled={generating}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: 'rgba(236,72,153,0.12)', border: '1px solid rgba(236,72,153,0.25)', color: '#EC4899', borderRadius: 999, fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', opacity: generating ? 0.6 : 1 }}>
              <AiIcon size={14} color="#EC4899" /> {generating ? 'Generating...' : 'AI Generate Plan'}
            </button>
          </div>

          {showAdd && (
            <div className={styles.addCard}>
              {subjects.length === 0 ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
                  No subjects found for your class yet.
                </p>
              ) : (
                <div className={styles.addGrid}>
                  <div>
                    <label className={styles.addLabel}>Subject</label>
                    <select value={newItem.subject_id} onChange={e => setNewItem(p => ({ ...p, subject_id: e.target.value }))} className={styles.addInput}>
                      {subjects.map(s => <option key={s.subject_id} value={s.subject_id}>{s.subject_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={styles.addLabel}>Day</label>
                    <select value={newItem.day_of_week} onChange={e => setNewItem(p => ({ ...p, day_of_week: Number(e.target.value) }))} className={styles.addInput}>
                      {DAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={styles.addLabel}>Start Time</label>
                    <input type="time" value={newItem.start_time} onChange={e => setNewItem(p => ({ ...p, start_time: e.target.value }))} className={styles.addInput} />
                  </div>
                  <div>
                    <label className={styles.addLabel}>End Time</label>
                    <input type="time" value={newItem.end_time} onChange={e => setNewItem(p => ({ ...p, end_time: e.target.value }))} className={styles.addInput} />
                  </div>
                  <div style={{ gridColumn: '1/-1' }}>
                    <label className={styles.addLabel}>Note (optional)</label>
                    <input value={newItem.label} onChange={e => setNewItem(p => ({ ...p, label: e.target.value }))}
                      className={styles.addInput} placeholder="e.g. Revise chapter 5" />
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                <button onClick={addSession} disabled={saving || subjects.length === 0}
                  style={{ flex: 1, height: 38, background: schoolColor, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Adding...' : 'Add'}
                </button>
                <button onClick={() => setShowAdd(false)}
                  style={{ flex: 1, height: 38, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-muted)', borderRadius: 8, fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {loading ? <div className={styles.loading}><span /><span /><span /></div>
            : plan.length === 0
              ? <div className={styles.empty}>
                  <CalendarIcon size={40} color="var(--text-faint)" strokeWidth={1} />
                  <p>No study plan yet. Add sessions or let AI build one for you.</p>
                </div>
              : <>
                  {DAYS.map(d => {
                    const dayItems = plan.filter(p => p.day_of_week === d.value)
                    if (dayItems.length === 0) return null
                    return (
                      <div key={d.value} style={{ marginBottom: 'var(--space-5)' }}>
                        <p className={styles.sectionLabel}>{DAY_LABEL[d.value]}</p>
                        <div className={styles.list}>
                          {dayItems.map(item => {
                            const color = colorFor(item.subject_id)
                            return (
                              <div key={item.id} className={styles.card}>
                                <div className={styles.cardIcon} style={{ background: color + '20' }}>
                                  <CalendarIcon size={16} color={color} />
                                </div>
                                <div className={styles.cardBody}>
                                  <p className={styles.cardTitle}>{item.label || subjectName(item.subject_id)}</p>
                                  <p className={styles.cardMeta}>
                                    {subjectName(item.subject_id)} · {item.start_time?.slice(0, 5)}–{item.end_time?.slice(0, 5)} · {item.duration_mins}m
                                  </p>
                                </div>
                                <button onClick={() => deleteSession(item.id)}
                                  style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--danger-subtle)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-md)', cursor: 'pointer', flexShrink: 0 }}>
                                  <TrashIcon size={13} color="var(--danger)" />
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </>
          }
          <div className={styles.spacer} />
        </main>
      </div>
    </div>
  )
}
