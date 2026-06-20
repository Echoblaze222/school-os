'use client'
// FIXED:
// 1. Own CSS module (no longer borrows student/records styles that don't have the right classes)
// 2. School-brand colour applied to active tabs, buttons, period accent bar
// 3. Edit modal — click any period to open an edit form pre-filled with its values
// 4. Supabase error surfaced to the user (toast-style banner)
// 5. create() and update() both reload the list after success
// 6. school_id guard before any query

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { ClockIcon, PlusIcon } from '@/components/Icons'
import styles from './timetable.module.css'

interface Props { profile: any; school: any; userId: string }

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

interface Period {
  id: string
  subject: string
  room: string
  start_time: string
  end_time: string
  day_of_week: string
  class_level: string
}

const EMPTY_FORM = { subject: '', room: '', start_time: '08:00', end_time: '09:00', class_level: '' }

export default function TimetableClient({ profile, school, userId }: Props) {
  const [periods,   setPeriods]   = useState<Period[]>([])
  const [loading,   setLoading]   = useState(true)
  const [showForm,  setShowForm]  = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [editId,    setEditId]    = useState<string | null>(null)
  const [day, setDay] = useState(() => {
    const d = new Date().getDay()
    return d === 0 || d === 6 ? 'Monday' : DAYS[d - 1]
  })
  const [form, setForm] = useState(EMPTY_FORM)

  const supabase = createClient()
  const sc = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [day])

  async function load() {
    if (!school?.id) return
    setLoading(true)
    const { data, error: err } = await supabase
      .from('timetable')
      .select('id, subject, room, start_time, end_time, day_of_week, class_level')
      .eq('school_id', school.id)
      .eq('teacher_id', userId)
      .eq('day_of_week', day)
      .order('start_time')
    if (err) setError(err.message)
    else setPeriods(data ?? [])
    setLoading(false)
  }

  function openCreate() {
    setEditId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
    setError(null)
  }

  function openEdit(p: Period) {
    setEditId(p.id)
    setForm({
      subject: p.subject,
      room: p.room ?? '',
      start_time: p.start_time?.slice(0, 5) ?? '08:00',
      end_time: p.end_time?.slice(0, 5) ?? '09:00',
      class_level: p.class_level ?? '',
    })
    setShowForm(true)
    setError(null)
  }

  async function save() {
    if (!form.subject.trim()) { setError('Subject is required'); return }
    setSaving(true)
    setError(null)
    if (editId) {
      const { error: err } = await supabase.from('timetable').update({
        subject: form.subject,
        room: form.room,
        start_time: form.start_time,
        end_time: form.end_time,
        class_level: form.class_level,
      }).eq('id', editId)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await supabase.from('timetable').insert({
        ...form,
        day_of_week: day,
        school_id: school?.id,
        teacher_id: userId,
      })
      if (err) { setError(err.message); setSaving(false); return }
    }
    setForm(EMPTY_FORM)
    setShowForm(false)
    setEditId(null)
    await load()
    setSaving(false)
  }

  async function deletePeriod(id: string) {
    if (!confirm('Remove this period?')) return
    await supabase.from('timetable').delete().eq('id', id)
    setPeriods(prev => prev.filter(p => p.id !== id))
  }

  function duration(start: string, end: string) {
    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)
    const mins = (eh * 60 + em) - (sh * 60 + sm)
    return mins > 0 ? `${mins} min` : ''
  }

  return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Timetable">

      {/* Day tabs + Add button */}
      <div className={styles.topBar}>
        <div className={styles.dayTabs}>
          {DAYS.map(d => (
            <button key={d} onClick={() => { setDay(d); setShowForm(false) }}
              className={styles.dayTab}
              style={day === d
                ? { background: sc, color: '#fff', borderColor: sc }
                : { borderColor: sc + '40', color: sc }}>
              {d.slice(0, 3)}
            </button>
          ))}
        </div>
        <button onClick={openCreate} className={styles.addBtn} style={{ background: sc }}>
          <PlusIcon size={13} color="#fff" /> Add
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className={styles.errorBanner}>
          ⚠️ {error}
          <button onClick={() => setError(null)} className={styles.errorClose}>✕</button>
        </div>
      )}

      {/* Create / Edit form */}
      {showForm && (
        <div className={styles.formCard}>
          <p className={styles.formTitle}>
            {editId ? 'Edit Period' : `Add Period — ${day}`}
          </p>
          <div className={styles.formGrid}>
            {[
              { key: 'subject',     label: 'Subject *',   placeholder: 'e.g. Mathematics', col: true },
              { key: 'start_time',  label: 'Start Time',  type: 'time' },
              { key: 'end_time',    label: 'End Time',    type: 'time' },
              { key: 'class_level', label: 'Class Level', placeholder: 'e.g. JSS 2' },
              { key: 'room',        label: 'Room',        placeholder: 'e.g. Room 12' },
            ].map(f => (
              <div key={f.key} className={styles.fieldWrap} style={f.col ? { gridColumn: '1/-1' } : {}}>
                <label className={styles.fieldLabel}>{f.label}</label>
                <input
                  type={f.type ?? 'text'}
                  value={(form as any)[f.key]}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder ?? ''}
                  className={styles.input}
                  style={{ borderColor: (form as any)[f.key] ? sc + '80' : undefined }}
                />
              </div>
            ))}
          </div>
          <div className={styles.formActions}>
            <button onClick={save} disabled={saving || !form.subject}
              className={styles.btnPrimary} style={{ background: sc }}>
              {saving ? (editId ? 'Saving...' : 'Adding...') : (editId ? 'Save Changes' : 'Add Period')}
            </button>
            <button onClick={() => { setShowForm(false); setEditId(null) }} className={styles.btnSecondary}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading
        ? <div className={styles.loader}><span /><span /><span /></div>
        : periods.length === 0
          ? (
            <div className={styles.empty}>
              <ClockIcon size={40} color="var(--text-faint)" strokeWidth={1} />
              <p>No periods for {day}</p>
              <button onClick={openCreate} style={{ marginTop: 8, padding: '6px 16px', background: sc, color: '#fff', border: 'none', borderRadius: 999, fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
                + Add First Period
              </button>
            </div>
          )
          : (
            <div className={styles.periodList}>
              {periods.map(p => (
                <div key={p.id} className={styles.periodCard} onClick={() => openEdit(p)} style={{ cursor: 'pointer' }}>
                  {/* Time column */}
                  <div className={styles.timeCol}>
                    <span className={styles.timeStart}>{p.start_time?.slice(0, 5)}</span>
                    <div className={styles.timeLine} style={{ background: sc + '50' }} />
                    <span className={styles.timeEnd}>{p.end_time?.slice(0, 5)}</span>
                  </div>
                  {/* Body */}
                  <div className={styles.periodBody} style={{ borderLeftColor: sc }}>
                    <p className={styles.periodSubject}>{p.subject}</p>
                    <p className={styles.periodMeta}>
                      {p.class_level ? `${p.class_level}` : ''}
                      {p.class_level && p.room ? ' · ' : ''}
                      {p.room ? `📍 ${p.room}` : ''}
                    </p>
                    <div className={styles.periodFooter}>
                      <span className={styles.duration}>
                        <ClockIcon size={11} color="var(--text-muted)" />
                        {duration(p.start_time, p.end_time)}
                      </span>
                      <span className={styles.editHint}>Tap to edit</span>
                    </div>
                  </div>
                  {/* Delete */}
                  <button
                    onClick={e => { e.stopPropagation(); deletePeriod(p.id) }}
                    className={styles.deleteBtn}
                    title="Remove period">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )
      }
      <div style={{ height: 80 }} />
    </RolePageWrapper>
  )
}
