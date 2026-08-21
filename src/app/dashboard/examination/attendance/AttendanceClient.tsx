'use client'
// src/app/dashboard/examination/attendance/AttendanceClient.tsx

import { useState } from 'react'
import RolePageWrapper from '@/components/RolePageWrapper'
import { createClient } from '@/lib/supabase/client'
import motion from '@/components/dashboard-motion.module.css'

interface TimetableRow {
  id: string; exam_date: string; start_time: string; end_time: string
  class_subjects?: { classes: { id: string; name: string }; subjects: { name: string } } | null
}
interface Student { id: string; full_name: string }

interface Props {
  userId: string; profile: any; school: any; schoolId: string
  timetable: TimetableRow[]
  initialRoster: Record<string, Student[]>
  initialAttendance: Record<string, Record<string, { id: string; status: string }>>
}

function statusColor(status: string) {
  if (status === 'present') return 'var(--success, #3FA66B)'
  if (status === 'absent') return 'var(--danger, #E53E3E)'
  return 'var(--warning, #E4572E)'
}

export default function AttendanceClient({ userId, profile, school, schoolId, timetable, initialRoster, initialAttendance }: Props) {
  const supabase = createClient()
  const [openId, setOpenId] = useState<string | null>(timetable[0]?.id ?? null)
  const [attendance, setAttendance] = useState(initialAttendance)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function mark(timetableId: string, studentId: string, status: 'present' | 'absent' | 'excused') {
    const key = `${timetableId}:${studentId}`
    setBusyKey(key)
    const existing = attendance[timetableId]?.[studentId]
    const { data, error: upsertError } = await supabase
      .from('exam_attendance')
      .upsert(
        { id: existing?.id, exam_timetable_id: timetableId, school_id: schoolId, student_id: studentId, status, marked_by: userId },
        { onConflict: 'exam_timetable_id,student_id' },
      )
      .select('id, status')
      .single()
    setBusyKey(null)
    if (upsertError) {
      setError(`Couldn't mark that student, ${upsertError.message}. Nothing changed, try again.`)
      return
    }
    setAttendance(prev => ({
      ...prev,
      [timetableId]: { ...(prev[timetableId] ?? {}), [studentId]: { id: (data as any).id, status: (data as any).status } },
    }))
  }

  if (timetable.length === 0) {
    return (
      <RolePageWrapper userId={userId} role="examination" profile={profile} school={school} title="Exam Attendance">
        <div className="glass-card-flat" style={{ padding: 20, borderRadius: 'var(--radius-xl)', textAlign: 'center' }}>
          <p style={{ margin: 0, opacity: 0.75 }}>
            No exam sittings assigned to you yet. Attendance can only be marked for sittings you're invigilating.
          </p>
        </div>
      </RolePageWrapper>
    )
  }

  return (
    <RolePageWrapper userId={userId} role="examination" profile={profile} school={school} title="Exam Attendance">
      {error && (
        <div className="glass-card-flat" style={{ padding: 12, borderRadius: 'var(--radius-lg)', marginBottom: 12, border: '1px solid var(--danger)' }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }}>{error}</p>
        </div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {timetable.map(t => {
          const roster = initialRoster[t.id] ?? []
          const marked = Object.keys(attendance[t.id] ?? {}).length
          const isOpen = openId === t.id
          return (
            <div key={t.id} className={`glass-card ${motion.pressable}`} style={{ padding: 14, borderRadius: 'var(--radius-xl)' }}>
              <button onClick={() => setOpenId(isOpen ? null : t.id)} style={{ all: 'unset', cursor: 'pointer', width: '100%', display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 700 }}>
                    {t.class_subjects?.subjects?.name ?? 'Subject'} · {t.class_subjects?.classes?.name ?? 'Class'}
                  </p>
                  <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>{t.exam_date} · {t.start_time}–{t.end_time}</p>
                </div>
                <span style={{ fontSize: 12, opacity: 0.6, alignSelf: 'center' }}>{marked}/{roster.length} marked</span>
              </button>

              {isOpen && (
                <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
                  {roster.length === 0 && <p style={{ fontSize: 13, opacity: 0.6 }}>No students found for this class.</p>}
                  {roster.map(s => {
                    const current = attendance[t.id]?.[s.id]?.status
                    return (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 14 }}>{s.full_name}</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {(['present', 'absent', 'excused'] as const).map(st => {
                            const key = `${t.id}:${s.id}`
                            const active = current === st
                            return (
                              <button key={st} disabled={busyKey === key}
                                onClick={() => mark(t.id, s.id, st)}
                                style={{
                                  fontSize: 11, padding: '4px 8px', borderRadius: 'var(--radius-full)',
                                  border: '1px solid var(--border)', cursor: 'pointer', textTransform: 'capitalize',
                                  background: active ? statusColor(st) : 'transparent',
                                  color: active ? '#fff' : 'inherit',
                                  opacity: busyKey === key ? 0.6 : 1,
                                }}>
                                {busyKey === key ? '…' : st}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </RolePageWrapper>
  )
}
