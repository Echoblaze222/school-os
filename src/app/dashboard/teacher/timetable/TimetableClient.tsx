'use client'
// src/app/dashboard/teacher/timetable/TimetableClient.tsx
// FIX: Real `timetable` table has class_id + class_subject_id (foreign keys),
// NOT free-text `subject` / `class_level` columns.
//
// FIX (this round): `class_subjects.subject_id` has no FK constraint in the
// database, so PostgREST's nested-join syntax `class_subjects(subjects(name))`
// fails with "Could not find a relationship between 'class_subjects' and
// 'subjects'". Rather than depend on a DB migration being applied, this
// version resolves subject/class names manually via a local lookup built
// from teacherClasses (already fetched separately) instead of asking
// PostgREST to join it. Run fix_class_subjects_fk.sql too — it's still
// worth having the FK for other features, but this file no longer depends on it.
//
// Carried over: visible error banner + error checks on load/create/delete.

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
// FIX: `day_of_week` is an INTEGER column, not text — the old client sent
// 'Monday' directly and got "invalid input syntax for type integer".
// Using ISO convention: 1 = Monday ... 5 = Friday (matches the Mon–Fri tabs,
// no DB constraint or existing data defines this, so this is the standard
// assumption for a school-week schedule with no weekend entries).
const DAY_TO_NUM: Record<string, number> = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5 }
const NUM_TO_DAY: Record<number, string> = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday' }

export default function TimetableClient({ profile, school, userId }: Props) {
  const [teacherClasses, setTeacherClasses] = useState<TeacherClass[]>([])
  const [periods,  setPeriods]  = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)
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

  // FIX: lookup map built locally instead of relying on a PostgREST nested join
  const classLookup: Record<string, { className: string; subject: string | null }> = {}
  teacherClasses.forEach(c => {
    if (c.class_id) classLookup[c.class_id] = { className: c.class_name, subject: c.subject }
  })

  useEffect(() => { loadTeacherClasses() }, [])
  useEffect(() => { if (school?.id) load() }, [day, school?.id])

  async function loadTeacherClasses() {
    const { data: ct, error: err } = await supabase
      .from('class_teachers')
      .select('class_id, subject, classes(name)')
      .eq('teacher_id', userId)
      .eq('school_id', school?.id)

    if (err) { console.error('[timetable] class_teachers error:', err.message); setError(err.message); return }
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
    // FIX: no nested join — select class_id directly, resolve name via classLookup at render time
    const { data, error: err } = await supabase
      .from('timetable')
      .select('id, room, start_time, end_time, day_of_week, class_id, class_subject_id')
      .eq('school_id', school?.id)
      .eq('teacher_id', userId)
      .eq('day_of_week', DAY_TO_NUM[day]) // FIX: send integer, not 'Monday'
      .order('start_time')
    if (err) {
      console.error('[timetable] load error:', err.message)
      setError(err.message)
    }
    if (data) setPeriods(data)
    setLoading(false)
  }

  async function create() {
    if (!form.class_id) return
    setSaving(true)
    setError(null)
    const now2 = new Date()
    const academicYear = `${now2.getFullYear()}/${now2.getFullYear() + 1}`
    const { error: err } = await supabase.from('timetable').insert({
      class_id:         form.class_id,
      class_subject_id: form.class_subject_id || null,
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
      console.error('[timetable] insert error:', err.message)
      setError(err.message)
    }
    setSaving(false)
  }

  async function deletePeriod(id: string) {
    setError(null)
    const { error: err } = await supabase.from('timetable').delete().eq('id', id)
    if (err) { console.error('[timetable] delete error:', err.message); setError(err.message); return }
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
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#EF444415', border: '1px solid #EF444440', borderRadius: 10, marginBottom: 'var(--space-4)' }}>
          <span style={{ fontSize: '0.8rem', color: '#EF4444', flex: 1 }}>⚠️ {error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 800 }}>✕</button>
        </div>
      )}
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

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#EF444415', border: '1px solid #EF444440', borderRadius: 10, marginBottom: 'var(--space-4)' }}>
          <span style={{ fontSize: '0.8rem', color: '#EF4444', flex: 1 }}>⚠️ {error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 800 }}>✕</button>
        </div>
      )}

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
            {periods.map((p: any) => {
              const cls = classLookup[p.class_id] // FIX: resolved locally, not via DB join
              return (
                <div key={p.id} className={styles.periodCard}>
                  <div className={styles.periodTime}>
                    <span className={styles.timeStart}>{p.start_time?.slice(0, 5)}</span>
                    <div className={styles.timeLine} style={{ background: sc + '60' }} />
                    <span className={styles.timeEnd}>{p.end_time?.slice(0, 5)}</span>
                  </div>
                  <div className={styles.periodBody} style={{ borderLeftColor: sc }}>
                    <p className={styles.periodSubject}>
                      {cls?.className ?? '—'}{cls?.subject ? ` · ${cls.subject}` : ''}
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
              )
            })}
          </div>
      }
      <div className={styles.spacer} />
    </RolePageWrapper>
  )
          }
                    
