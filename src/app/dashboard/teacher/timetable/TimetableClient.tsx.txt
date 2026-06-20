'use client'
// src/app/dashboard/teacher/timetable/TimetableClient.tsx
// FIX: Real `timetable` table has class_id + class_subject_id (foreign keys),
// NOT free-text `subject` / `class_level` columns. The old client tried to
// select/insert those columns directly, so every query failed silently —
// nothing ever loaded or saved.
// This version resolves the teacher's classes via class_teachers → class_subjects,
// lets the teacher pick a class from a dropdown, and stores class_subject_id + class_id.

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { ClockIcon, PlusIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

interface TeacherClass {
  class_id: string
  class_name: string
  subject: string | null
  class_subject_id: string | null
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

export default function TimetableClient({ profile, school, userId }: Props) {
  const [teacherClasses, setTeacherClasses] = useState<TeacherClass[]>([])
  const [periods,  setPeriods]  = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [day,      setDay]      = useState(() => {
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

  async function loadTeacherClasses() {
    const { data: ct } = await supabase
      .from('class_teachers')
      .select('class_id, subject, classes(name)')
      .eq('teacher_id', userId)
      .eq('school_id', school?.id)

    if (!ct?.length) return

    const list: TeacherClass[] = await Promise.all(
      ct.map(async (row: any) => {
        const { data: cs } = await supabase
          .from('class_subjects')
          .select('id')
          .eq('class_id', row.class_id)
          .limit(1)
          .maybeSingle()
        return {
          class_id:          row.class_id,
          class_name:        row.classes?.name ?? '',
          subject:           row.subject,
          class_subject_id:  cs?.id ?? null,
        }
      })
    )
    setTeacherClasses(list)
    if (list[0]) {
      setForm(f => ({ ...f, class_id: list[0].class_id, class_subject_id: list[0].class_subject_id ?? '' }))
    }
  }

  async function load() {
    setLoading(true)
    // FIX: select class_id + class_subject_id, join classes(name) and
    // class_subjects(subjects(name)) for display — no `subject`/`class_level` columns exist
    const { data } = await supabase
      .from('timetable')
      .select(`
        id, room, start_time, end_time, day_of_week,
        class_id, class_subject_id,
        classes ( name ),
        class_subjects ( subjects ( name ) )
      `)
      .eq('school_id', school?.id)
      .eq('teacher_id', userId)
      .eq('day_of_week', day)
      .order('start_time')
    if (data) setPeriods(data)
    setLoading(false)
  }

  async function create() {
    if (!form.class_id) return
    setSaving(true)
    // FIX: insert class_id + class_subject_id, not free-text subject/class_level
    const { error } = await supabase.from('timetable').insert({
      class_id:         form.class_id,
      class_subject_id: form.class_subject_id || null,
      room:             form.room || null,
      start_time:       form.start_time,
      end_time:         form.end_time,
      day_of_week:      day,
      school_id:        school?.id,
      teacher_id:       userId,
    })
    if (!error) {
      setForm(f => ({ ...f, room: '', start_time: '08:00', end_time: '09:00' }))
      setShowForm(false)
      load()
    } else {
      console.error('[timetable] insert error:', error.message)
    }
    setSaving(false)
  }

  async function deletePeriod(id: string) {
    await supabase.from('timetable').delete().eq('id', id)
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

      {showForm && (
        <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-5)', marginBottom: 'var(--space-5)' }}>
          <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-4)', fontSize: '0.9rem' }}>Add Period — {day}</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 'var(--space-3)' }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Class *</label>
            <select value={form.class_id}
              onChange={e => {
                const cls = teacherClasses.find(c => c.class_id === e.target.value)
                setForm(f => ({ ...f, class_id: e.target.value, class_subject_id: cls?.class_subject_id ?? '' }))
              }}
              style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }}>
              {teacherClasses.map(cls => (
                <option key={cls.class_id} value={cls.class_id}>
                  {cls.class_name}{cls.subject ? ` (${cls.subject})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            {[
              { key: 'start_time', label: 'Start Time', type: 'time' },
              { key: 'end_time',   label: 'End Time',   type: 'time' },
              { key: 'room',       label: 'Room',       placeholder: 'e.g. Room 12', col: '1/-1' },
            ].map(f => (
              <div key={f.key} style={{ gridColumn: (f as any).col ?? 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{f.label}</label>
                <input type={f.type ?? 'text'} value={(form as any)[f.key]}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder ?? ''}
                  style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
            <button onClick={create} disabled={saving || !form.class_id}
              style={{ flex: 1, height: 40, background: sc, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Adding...' : 'Add Period'}
            </button>
            <button onClick={() => setShowForm(false)}
              style={{ flex: 1, height: 40, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 8, color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? <div className={styles.loading}><span /><span /><span /></div>
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
                    {p.classes?.name ?? '—'}{p.class_subjects?.subjects?.name ? ` · ${p.class_subjects.subjects.name}` : ''}
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
