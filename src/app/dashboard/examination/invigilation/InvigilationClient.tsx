'use client'
// src/app/dashboard/examination/invigilation/InvigilationClient.tsx

import { useState } from 'react'
import RolePageWrapper from '@/components/RolePageWrapper'
import { createClient } from '@/lib/supabase/client'
import motion from '@/components/dashboard-motion.module.css'

interface TimetableRow {
  id: string; exam_date: string; start_time: string; end_time: string
  class_subjects?: { classes: { name: string }; subjects: { name: string } } | null
  exam_rooms?: { id: string; name: string } | null
}
interface Teacher { id: string; full_name: string }
interface Assignment {
  id: string; exam_timetable_id: string; profile_id: string; room_id: string | null
  status: string; profiles?: { full_name: string } | null; exam_rooms?: { name: string } | null
}

interface Props {
  userId: string; profile: any; school: any; schoolId: string
  timetable: TimetableRow[]; teachers: Teacher[]; initialAssignments: Assignment[]; canAssign: boolean
}

export default function InvigilationClient({ userId, profile, school, schoolId, timetable, teachers, initialAssignments, canAssign }: Props) {
  const supabase = createClient()
  const [assignments, setAssignments] = useState(initialAssignments)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pickerFor, setPickerFor] = useState<string | null>(null)

  async function assign(timetableId: string, roomId: string | null, teacherId: string) {
    setBusyKey(timetableId)
    const { data, error: insertError } = await supabase
      .from('invigilator_assignments')
      .insert({ school_id: schoolId, exam_timetable_id: timetableId, room_id: roomId, profile_id: teacherId, assigned_by: userId })
      .select('id, exam_timetable_id, profile_id, room_id, status, profiles!profile_id(full_name), exam_rooms(name)')
      .single()
    setBusyKey(null)
    setPickerFor(null)
    if (insertError) {
      setError(insertError.code === '23505'
        ? 'That teacher is already assigned to this sitting.'
        : `Couldn't assign, ${insertError.message}`)
      return
    }
    setAssignments(prev => [...prev, data as any])
  }

  async function unassign(id: string) {
    setBusyKey(id)
    const { error: deleteError } = await supabase.from('invigilator_assignments').delete().eq('id', id)
    setBusyKey(null)
    if (deleteError) { setError(`Couldn't remove that assignment, ${deleteError.message}`); return }
    setAssignments(prev => prev.filter(a => a.id !== id))
  }

  async function confirmMyDuty(id: string) {
    setBusyKey(id)
    // Goes through confirm_invigilator_duty(), not a raw client update:
    // see the SQL comment on that function for why a generic "it's my
    // row" policy isn't safe here.
    const { error: rpcError } = await supabase.rpc('confirm_invigilator_duty', { p_assignment_id: id })
    setBusyKey(null)
    if (rpcError) { setError(`Couldn't confirm, ${rpcError.message}`); return }
    setAssignments(prev => prev.map(a => a.id === id ? { ...a, status: 'confirmed' } : a))
  }

  return (
    <RolePageWrapper userId={userId} role="examination" profile={profile} school={school} title="Invigilation">
      {error && (
        <div className="glass-card-flat" style={{ padding: 12, borderRadius: 'var(--radius-lg)', marginBottom: 12, border: '1px solid var(--danger)' }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }}>{error}</p>
        </div>
      )}

      {timetable.length === 0 ? (
        <div className="glass-card-flat" style={{ padding: 20, borderRadius: 'var(--radius-xl)', textAlign: 'center' }}>
          <p style={{ margin: 0, opacity: 0.75 }}>No upcoming sittings on the timetable yet.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {timetable.map(t => {
            const assigned = assignments.filter(a => a.exam_timetable_id === t.id)
            const myRow = assigned.find(a => a.profile_id === userId)
            return (
              <div key={t.id} className={`glass-card ${motion.pressable}`} style={{ padding: 14, borderRadius: 'var(--radius-xl)' }}>
                <p style={{ margin: 0, fontWeight: 700 }}>
                  {t.class_subjects?.subjects?.name ?? 'Subject'} · {t.class_subjects?.classes?.name ?? 'Class'}
                </p>
                <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>
                  {t.exam_date} · {t.start_time}–{t.end_time} · {t.exam_rooms?.name ?? 'No room'}
                </p>

                {assigned.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {assigned.map(a => (
                      <span key={a.id} style={{
                        fontSize: 12, padding: '4px 8px', borderRadius: 'var(--radius-full)',
                        background: a.status === 'confirmed' ? 'var(--success-subtle, rgba(63,166,107,0.15))' : 'var(--warning-subtle, rgba(228,87,46,0.15))',
                        color: a.status === 'confirmed' ? 'var(--success, #3FA66B)' : 'var(--warning, #E4572E)',
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                      }}>
                        {a.profiles?.full_name ?? 'Teacher'} · {a.status}
                        {canAssign && (
                          <button onClick={() => unassign(a.id)} disabled={busyKey === a.id}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 700 }}>×</button>
                        )}
                      </span>
                    ))}
                  </div>
                )}

                {myRow && myRow.status === 'assigned' && (
                  <button className="btn btn-primary" style={{ marginTop: 10, fontSize: 13 }}
                    disabled={busyKey === myRow.id} onClick={() => confirmMyDuty(myRow.id)}>
                    {busyKey === myRow.id ? 'Confirming…' : 'Confirm my duty'}
                  </button>
                )}

                {canAssign && (
                  <div style={{ marginTop: 10 }}>
                    {pickerFor === t.id ? (
                      <select autoFocus defaultValue="" onChange={e => e.target.value && assign(t.id, t.exam_rooms?.id ?? null, e.target.value)} style={inputStyle}>
                        <option value="" disabled>Select a teacher…</option>
                        {teachers.filter(tc => !assigned.some(a => a.profile_id === tc.id)).map(tc => (
                          <option key={tc.id} value={tc.id}>{tc.full_name}</option>
                        ))}
                      </select>
                    ) : (
                      <button className="btn" style={{ fontSize: 13 }} disabled={busyKey === t.id} onClick={() => setPickerFor(t.id)}>
                        {busyKey === t.id ? 'Assigning…' : '+ Assign invigilator'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </RolePageWrapper>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'inherit', fontSize: 14, width: '100%',
}
