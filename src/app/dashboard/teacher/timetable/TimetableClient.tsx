'use client'
// src/app/dashboard/teacher/timetable/TimetableClient.tsx
// ADDED: Subject dropdown in the Add Period form.
// When teacher selects a Class, the Subject dropdown loads all subjects
// assigned to that class from class_subjects → subjects.
// class_subject_id is then set from the selected subject, not auto-resolved.

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { ClockIcon, PlusIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

interface TeacherClass {
  class_id:   string
  class_name: string
  subject:    string | null
}

interface SubjectOption {
  class_subject_id: string
  subject_name:     string
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const DAY_TO_NUM: Record<string, number> = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5 }

export default function TimetableClient({ profile, school, userId }: Props) {
  const [teacherClasses,  setTeacherClasses]  = useState<TeacherClass[]>([])
  const [subjectOptions,  setSubjectOptions]  = useState<SubjectOption[]>([])
  const [subjectMap,      setSubjectMap]      = useState<Record<string, string>>({}) // class_subject_id → subject name
  const [periods,         setPeriods]         = useState<any[]>([])
  const [loading,         setLoading]         = useState(true)
  const [showForm,        setShowForm]        = useState(false)
  const [saving,          setSaving]          = useState(false)
  const [error,           setError]           = useState<string | null>(null)
  const [day,             setDay]             = useState(() => {
    const d = new Date().getDay()
    return d === 0 || d === 6 ? 'Monday' : DAYS[d - 1]
  })
  const [form, setForm] = useState({
    class_id: '', class_subject_id: '',
    room: '', start_time: '08:00', end_time: '09:00',
  })

  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  useEffect(() => { loadTeacherClasses() }, [])
  useEffect(() => { if (school?.id) load() }, [day, school?.id])

  // When class changes in form, load that class's subjects
  useEffect(() => {
    if (form.class_id) loadSubjectsForClass(form.class_id)
  }, [form.class_id])

  async function loadTeacherClasses() {
    const { data: ct, error: err } = await supabase
      .from('class_teachers')
      .select('class_id, subject, classes(name)')
      .eq('teacher_id', userId)
      .eq('school_id', school?.id)

    if (err) { setError(err.message); return }
    if (!ct?.length) return

    const list: TeacherClass[] = ct.map((row: any) => ({
      class_id:   row.class_id,
      class_name: row.classes?.name ?? '',
      subject:    row.subject,
    }))

    setTeacherClasses(list)
    if (list[0]) {
      setForm(f => ({ ...f, class_id: list[0].class_id }))
    }
  }

  async function loadSubjectsForClass(classId: string) {
    setSubjectOptions([])
    setForm(f => ({ ...f, class_subject_id: '' }))

    const { data, error: err } = await supabase
      .from('class_subjects')
      .select('id, subjects(name)')
      .eq('class_id', classId)
      .order('id')

    if (err) { console.error('[timetable] subjects error:', err.message); return }
    if (!data) return

    const options: SubjectOption[] = data
      .filter((cs: any) => cs.subjects?.name)
      .map((cs: any) => ({ class_subject_id: cs.id, subject_name: cs.subjects.name }))
      .sort((a: SubjectOption, b: SubjectOption) => a.subject_name.localeCompare(b.subject_name))

    setSubjectOptions(options)

    // Build display map for the period list
    const map: Record<string, string> = {}
    options.forEach(o => { map[o.class_subject_id] = o.subject_name })
    setSubjectMap(prev => ({ ...prev, ...map }))

    // Auto-select the teacher's own subject if found
    const teacherSubject = teacherClasses.find(c => c.class_id === classId)?.subject
    const match = options.find(o => o.subject_name.toLowerCase() === teacherSubject?.toLowerCase())
    if (match) {
      setForm(f => ({ ...f, class_subject_id: match.class_subject_id }))
    } else if (options[0]) {
      setForm(f => ({ ...f, class_subject_id: options[0].class_subject_id }))
    }
  }

  async function load() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('timetable')
      .select('id, room, start_time, end_time, day_of_week, class_id, class_subject_id, teacher:profiles!teacher_id(full_name)')
      .eq('school_id', school?.id)
      .eq('teacher_id', userId)
      .eq('day_of_week', DAY_TO_NUM[day])
      .order('start_time')

    if (err) { setError(err.message) }
    if (data) {
      setPeriods(data)
      // Load subject names for any class_subject_ids not yet in map
      const unknownIds = [...new Set(data.map((p: any) => p.class_subject_id).filter((id: string) => id && !subjectMap[id]))]
      if (unknownIds.length > 0) {
        const { data: csData } = await supabase
          .from('class_subjects')
          .select('id, subjects(name)')
          .in('id', unknownIds)
        if (csData) {
          const extra: Record<string, string> = {}
          csData.forEach((cs: any) => { if (cs.subjects?.name) extra[cs.id] = cs.subjects.name })
          setSubjectMap(prev => ({ ...prev, ...extra }))
        }
      }
    }
    setLoading(false)
  }

  async function create() {
    if (!form.class_id)         { setError('Please select a class');   return }
    if (!form.class_subject_id) { setError('Please select a subject'); return }
    setSaving(true)
    setError(null)
    const now2 = new Date()
    const academicYear = `${now2.getFullYear()}/${now2.getFullYear() + 1}`
    const { error: err } = await supabase.from('timetable').insert({
      class_id:         form.class_id,
      class_subject_id: form.class_subject_id,
      room:             form.room || null,
      start_time:       form.start_time,
      end_time:         form.end_time,
      day_of_week:      DAY_TO_NUM[day],
      school_id:        school?.id,
      teacher_id:       userId,
      academic_year:    academicYear,
    })
    if (!err) {
      setForm(f => ({ ...f, room: '', start_time: '08:00', end_time: '09:00' }))
      setShowForm(false)
      load()
    } else {
      setError(err.message)
    }
    setSaving(false)
  }

  async function deletePeriod(id: string) {
    setError(null)
    const { error: err } = await supabase.from('timetable').delete().eq('id', id)
    if (err) { setError(err.message); return }
    setPeriods(prev => prev.filter(p => p.id !== id))
  }

  function duration(start: string, end: string) {
    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)
    const mins = (eh * 60 + em) - (sh * 60 + sm)
    return mins > 0 ? `${mins} min` : ''
  }

  if (!loading && teacherClasses.length === 0) return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Timetable">
      <div className={styles.empty}>
        <ClockIcon size={40} color="var(--text-faint)" strokeWidth={1} />
        <p>No classes assigned yet. Ask the principal to assign you a class.</p>
      </div>
    </RolePageWrapper>
  )

  return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Timetable">

      {/* Day tabs + Add button */}
      <div className={styles.dayTabs} style={{ marginBottom: 'var(--space-4)' }}>
        {DAYS.map(d => (
          <button key={d} onClick={() => setDay(d)}
            className={`${styles.dayTab} ${day === d ? styles.dayTabActive : ''}`}
            style={day === d ? { background: sc, color: '#fff', borderColor: sc } : {}}>
            {d.slice(0, 3)}
          </button>
        ))}
        <button onClick={() => setShowForm(!showForm)}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: sc, color: '#fff', border: 'none', borderRadius: 999, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', flexShrink: 0 }}>
          <PlusIcon size={13} color="white" /> Add
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#EF444415', border: '1px solid #EF444440', borderRadius: 10, marginBottom: 'var(--space-4)' }}>
          <span style={{ fontSize: '0.8rem', color: '#EF4444', flex: 1 }}>⚠️ {error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 800 }}>✕</button>
        </div>
      )}

      {/* Add period form */}
      {showForm && (
        <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-5)', marginBottom: 'var(--space-5)' }}>
          <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-4)', fontSize: '0.9rem' }}>
            Add Period — {day}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>

            {/* Class */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Class *</label>
              <select value={form.class_id}
                onChange={e => setForm(f => ({ ...f, class_id: e.target.value }))}
                style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }}>
                <option value="">Select a class</option>
                {teacherClasses.map(cls => (
                  <option key={cls.class_id} value={cls.class_id}>{cls.class_name}</option>
                ))}
              </select>
            </div>

            {/* Subject */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Subject *</label>
              <select value={form.class_subject_id}
                onChange={e => setForm(f => ({ ...f, class_subject_id: e.target.value }))}
                disabled={!form.class_id || subjectOptions.length === 0}
                style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', opacity: !form.class_id ? 0.5 : 1 }}>
                <option value="">Select a subject</option>
                {subjectOptions.map(o => (
                  <option key={o.class_subject_id} value={o.class_subject_id}>{o.subject_name}</option>
                ))}
              </select>
            </div>

            {/* Start + End time */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Start Time</label>
                <input type="time" value={form.start_time}
                  onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                  style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>End Time</label>
                <input type="time" value={form.end_time}
                  onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                  style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
              </div>
            </div>

            {/* Room */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Room</label>
              <input type="text" value={form.room}
                onChange={e => setForm(f => ({ ...f, room: e.target.value }))}
                placeholder="e.g. Room 12"
                style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
            </div>

          </div>

          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
            <button onClick={create} disabled={saving || !form.class_id || !form.class_subject_id}
              style={{ flex: 1, height: 40, background: sc, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', opacity: saving || !form.class_subject_id ? 0.5 : 1 }}>
              {saving ? 'Adding...' : 'Add Period'}
            </button>
            <button onClick={() => setShowForm(false)}
              style={{ flex: 1, height: 40, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 8, color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Period list */}
      {loading
        ? <div className={styles.loading}><span /><span /><span /></div>
        : periods.length === 0
          ? <div className={styles.empty}><ClockIcon size={40} color="var(--text-faint)" strokeWidth={1} /><p>No periods for {day}</p></div>
          : <div className={styles.periodList}>
            {periods.map((p: any) => (
              <div key={p.id} className={styles.periodCard}>
                <div className={styles.periodTime}>
                  <span className={styles.timeStart}>{p.start_time?.slice(0, 5)}</span>
                  <div className={styles.timeLine} style={{ background: sc + '60' }} />
                  <span className={styles.timeEnd}>{p.end_time?.slice(0, 5)}</span>
                </div>
                <div className={styles.periodBody} style={{ borderLeftColor: sc }}>
                  <p className={styles.periodSubject}>
                    {subjectMap[p.class_subject_id] ?? 'Subject'}
                  </p>
                  <p className={styles.periodMeta}>{p.room ? `📍 ${p.room}` : ''}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className={styles.periodDuration}>
                      <ClockIcon size={11} color="var(--text-muted)" />
                      <span>{duration(p.start_time, p.end_time)}</span>
                    </div>
                    <button onClick={() => deletePeriod(p.id)}
                      style={{ fontSize: '0.68rem', fontWeight: 700, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
      }
      <div className={styles.spacer} />
    </RolePageWrapper>
  )
}
