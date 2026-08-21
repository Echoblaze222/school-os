'use client'
// src/app/dashboard/examination/timetable/TimetableClient.tsx

import { useState } from 'react'
import RolePageWrapper from '@/components/RolePageWrapper'
import { createClient } from '@/lib/supabase/client'
import motion from '@/components/dashboard-motion.module.css'

interface Session { id: string; name: string; status: string }
interface Room { id: string; name: string; capacity: number | null }
interface ClassSubject { id: string; classes: { id: string; name: string }; subjects: { id: string; name: string } }
interface TimetableRow {
  id: string; exam_session_id: string; exam_date: string; start_time: string; end_time: string
  max_score: number; status: string; room_id: string | null
  exam_rooms?: { name: string } | null
  class_subjects?: { classes: { name: string }; subjects: { name: string } } | null
}

interface Props {
  userId: string; profile: any; school: any; schoolId: string
  sessions: Session[]; rooms: Room[]; classSubjects: ClassSubject[]
  initialTimetable: TimetableRow[]; canManage: boolean
}

export default function TimetableClient({
  userId, profile, school, schoolId, sessions, rooms: initialRooms, classSubjects, initialTimetable, canManage,
}: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState(initialTimetable)
  const [rooms, setRooms] = useState(initialRooms)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newRoomName, setNewRoomName] = useState('')
  const [roomSaving, setRoomSaving] = useState(false)
  const [form, setForm] = useState({
    exam_session_id: sessions[0]?.id ?? '', class_subject_id: '', room_id: '',
    exam_date: '', start_time: '', end_time: '', max_score: '100',
  })

  async function addRoom(e: React.FormEvent) {
    e.preventDefault()
    if (roomSaving || !newRoomName.trim()) return
    setRoomSaving(true)
    const { data, error: insertError } = await supabase
      .from('exam_rooms').insert({ school_id: schoolId, name: newRoomName.trim() })
      .select('id, name, capacity').single()
    setRoomSaving(false)
    if (insertError) { setError(`Couldn't add room, ${insertError.message}`); return }
    setRooms(prev => [...prev, data as Room])
    setNewRoomName('')
  }


  async function createEntry(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    if (!form.exam_session_id || !form.class_subject_id || !form.exam_date || !form.start_time || !form.end_time) {
      setError('Session, subject, date, and both times are required.')
      return
    }
    if (form.end_time <= form.start_time) {
      setError('End time needs to be after the start time.')
      return
    }
    setSaving(true)
    setError(null)
    const { data, error: insertError } = await supabase
      .from('exam_timetable')
      .insert({
        school_id: schoolId, created_by: userId,
        exam_session_id: form.exam_session_id,
        class_subject_id: form.class_subject_id,
        room_id: form.room_id || null,
        exam_date: form.exam_date, start_time: form.start_time, end_time: form.end_time,
        max_score: Number(form.max_score) || 100,
      })
      .select('id, exam_session_id, exam_date, start_time, end_time, max_score, status, room_id, exam_rooms(name), class_subjects(classes(name), subjects(name))')
      .single()

    setSaving(false)
    if (insertError) {
      setError(`Couldn't add that to the timetable, ${insertError.message}. Nothing was lost, try again.`)
      return
    }
    setRows(prev => [...prev, data as any].sort((a, b) => a.exam_date.localeCompare(b.exam_date)))
    setShowForm(false)
  }

  return (
    <RolePageWrapper userId={userId} role="examination" profile={profile} school={school} title="Exam Timetable">
      {error && (
        <div className="glass-card-flat" style={{ padding: 12, borderRadius: 'var(--radius-lg)', marginBottom: 12, border: '1px solid var(--danger)' }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }}>{error}</p>
        </div>
      )}

      {canManage && sessions.length === 0 && (
        <div className="glass-card-flat" style={{ padding: 16, borderRadius: 'var(--radius-xl)', marginBottom: 12 }}>
          <p style={{ margin: 0, opacity: 0.75 }}>Create an exam session first, then schedule subjects into it here.</p>
        </div>
      )}

      {canManage && sessions.length > 0 && (
        <button className="btn btn-primary" style={{ marginBottom: 16 }} onClick={() => setShowForm(s => !s)}>
          {showForm ? 'Cancel' : '+ Schedule a sitting'}
        </button>
      )}

      {showForm && (
        <form onSubmit={createEntry} className="glass-card" style={{ padding: 16, borderRadius: 'var(--radius-xl)', marginBottom: 16, display: 'grid', gap: 10 }}>
          <select value={form.exam_session_id} onChange={e => setForm(f => ({ ...f, exam_session_id: e.target.value }))} style={inputStyle}>
            {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={form.class_subject_id} onChange={e => setForm(f => ({ ...f, class_subject_id: e.target.value }))} required style={inputStyle}>
            <option value="">Select class + subject</option>
            {classSubjects.map(cs => (
              <option key={cs.id} value={cs.id}>{cs.classes?.name}, {cs.subjects?.name}</option>
            ))}
          </select>
          <select value={form.room_id} onChange={e => setForm(f => ({ ...f, room_id: e.target.value }))} style={inputStyle}>
            <option value="">No room assigned yet</option>
            {rooms.map(r => <option key={r.id} value={r.id}>{r.name}{r.capacity ? ` (${r.capacity})` : ''}</option>)}
          </select>
          {canManage && (
            <div style={{ display: 'flex', gap: 8 }}>
              <input placeholder="New room name (e.g. Hall A)" value={newRoomName}
                onChange={e => setNewRoomName(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
              <button type="button" className="btn" disabled={roomSaving} onClick={addRoom} style={{ whiteSpace: 'nowrap' }}>
                {roomSaving ? 'Adding…' : '+ Room'}
              </button>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <input type="date" value={form.exam_date} onChange={e => setForm(f => ({ ...f, exam_date: e.target.value }))} required style={inputStyle} />
            <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} required style={inputStyle} />
            <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} required style={inputStyle} />
          </div>
          <input type="number" min={1} placeholder="Max score (default 100)" value={form.max_score}
            onChange={e => setForm(f => ({ ...f, max_score: e.target.value }))} style={inputStyle} />
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Add to timetable'}</button>
        </form>
      )}

      {rows.length === 0 ? (
        <div className="glass-card-flat" style={{ padding: 20, borderRadius: 'var(--radius-xl)', textAlign: 'center' }}>
          <p style={{ margin: 0, opacity: 0.75 }}>Nothing on the timetable yet.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {rows.map(r => (
            <div key={r.id} className={`glass-card ${motion.pressable}`} style={{ padding: 14, borderRadius: 'var(--radius-xl)', display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <p style={{ margin: 0, fontWeight: 700 }}>
                  {r.class_subjects?.subjects?.name ?? 'Subject'} · {r.class_subjects?.classes?.name ?? 'Class'}
                </p>
                <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>
                  {r.exam_date} · {r.start_time}–{r.end_time} · {r.exam_rooms?.name ?? 'No room set'} · /{r.max_score}
                </p>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, alignSelf: 'center', textTransform: 'capitalize', opacity: 0.75 }}>{r.status}</span>
            </div>
          ))}
        </div>
      )}
    </RolePageWrapper>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'inherit', fontSize: 14, width: '100%',
}
