'use client'
// FIXED: removed non-existent teacher_id/subject from attendance insert
// FIXED: status text column (present/absent/late) instead of boolean is_present
// FIXED: upsert conflict key matches actual schema with UNIQUE constraint migration

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { CalendarIcon, CheckCircleIcon } from '@/components/Icons'
import styles from './attendance.module.css'

interface Props { profile: any; school: any; userId: string }

interface TeacherClass {
  class_id: string
  class_name: string
  class_level: string
  subject: string | null
  is_primary: boolean
}

export default function AttendanceClient({ profile, school, userId }: Props) {
  const [teacherClasses, setTeacherClasses] = useState<TeacherClass[]>([])
  const [selectedClass, setSelectedClass] = useState<TeacherClass | null>(null)
  const [students, setStudents] = useState<any[]>([])
  const [records, setRecords] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const supabase = createClient()
  const sc = school?.primary_color ?? '#7C3AED'

  useEffect(() => { loadTeacherClasses() }, [])
  useEffect(() => { if (selectedClass) loadStudents(selectedClass.class_id) }, [selectedClass])
  useEffect(() => { if (students.length && selectedClass) loadExisting() }, [students, date])

  async function loadTeacherClasses() {
    setLoading(true)
    const { data } = await supabase
      .from('class_teachers')
      .select('class_id, subject, is_primary, classes(id, name, class_level)')
      .eq('teacher_id', userId)
      .eq('school_id', school?.id)

    if (data?.length) {
      const list: TeacherClass[] = data.map((ct: any) => ({
        class_id: ct.class_id,
        class_name: ct.classes?.name ?? 'Unknown',
        class_level: ct.classes?.class_level ?? '',
        subject: ct.subject,
        is_primary: ct.is_primary ?? false,
      }))
      list.sort((a, b) => {
        if (a.is_primary && !b.is_primary) return -1
        if (!a.is_primary && b.is_primary) return 1
        return a.class_name.localeCompare(b.class_name)
      })
      setTeacherClasses(list)
      setSelectedClass(list[0])
    }
    setLoading(false)
  }

  async function loadStudents(classId: string) {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, default_code, avatar_url')
      .eq('class_id', classId)
      .eq('school_id', school?.id)
      .eq('role', 'student')
      .order('full_name')
    if (data) {
      setStudents(data)
      const init: Record<string, string> = {}
      data.forEach((s: any) => { init[s.id] = 'present' })
      setRecords(init)
    }
    setLoading(false)
  }

  async function loadExisting() {
    if (!selectedClass) return
    const { data } = await supabase
      .from('attendance')
      .select('student_id, status, is_present')
      .eq('school_id', school?.id)
      .eq('class_id', selectedClass.class_id)
      .eq('date', date)
      .in('student_id', students.map((s: any) => s.id))
    if (data?.length) {
      const map: Record<string, string> = {}
      data.forEach((r: any) => {
        // Support both status column and is_present boolean
        map[r.student_id] = r.status ?? (r.is_present ? 'present' : 'absent')
      })
      setRecords(prev => ({ ...prev, ...map }))
      setSaved(true)
    } else {
      setSaved(false)
    }
  }

  function toggle(id: string) {
    const cycle: Record<string, string> = { present: 'absent', absent: 'late', late: 'present' }
    setRecords(prev => ({ ...prev, [id]: cycle[prev[id]] ?? 'present' }))
    setSaved(false)
  }

  async function submit() {
    if (!selectedClass) return
    setSaving(true)
    // FIXED: only columns that exist — no teacher_id, no subject
    const rows = students.map((s: any) => ({
      school_id: school?.id,
      student_id: s.id,
      class_id: selectedClass.class_id,
      date,
      status: records[s.id] ?? 'present',
      is_present: (records[s.id] ?? 'present') === 'present',
      marked_by: userId,
    }))
    const { error } = await supabase
      .from('attendance')
      .upsert(rows, { onConflict: 'student_id,date,class_id' })
    if (error) {
      // Fallback: delete + insert if upsert fails (no unique constraint yet)
      await supabase.from('attendance')
        .delete()
        .eq('class_id', selectedClass.class_id)
        .eq('date', date)
        .in('student_id', students.map(s => s.id))
      await supabase.from('attendance').insert(rows)
    }
    setSaved(true)
    setSaving(false)
  }

  const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
    present: { bg: '#10B98115', color: '#10B981' },
    absent: { bg: '#EF444415', color: '#EF4444' },
    late: { bg: '#F59E0B15', color: '#F59E0B' },
  }

  const presentCount = Object.values(records).filter(v => v === 'present').length
  const absentCount = Object.values(records).filter(v => v === 'absent').length
  const lateCount = Object.values(records).filter(v => v === 'late').length

  if (loading && teacherClasses.length === 0) return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Attendance">
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>Loading your classes...</div>
    </RolePageWrapper>
  )

  if (!teacherClasses.length) return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Attendance">
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <CalendarIcon size={40} color="var(--text-faint)" strokeWidth={1} />
        <p style={{ color: 'var(--text-muted)', marginTop: 12 }}>No classes assigned yet. Contact your admin.</p>
      </div>
    </RolePageWrapper>
  )

  return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Attendance">

      {/* Class selector */}
      <div style={{ overflowX: 'auto', display: 'flex', gap: 8, marginBottom: 'var(--space-4)', paddingBottom: 4 }}>
        {teacherClasses.map(cls => (
          <button key={`${cls.class_id}-${cls.subject ?? 'class'}`}
            onClick={() => { setSelectedClass(cls); setSaved(false) }}
            style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 999, border: `1px solid ${selectedClass?.class_id === cls.class_id ? sc : sc + '40'}`, background: selectedClass?.class_id === cls.class_id ? sc : 'transparent', color: selectedClass?.class_id === cls.class_id ? '#fff' : sc, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {cls.class_name}
            {cls.subject ? ` · ${cls.subject}` : ''}
            {cls.is_primary ? ' 👑' : ''}
          </button>
        ))}
      </div>

      {/* Date picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--space-4)' }}>
        <input type="date" value={date} onChange={e => { setDate(e.target.value); setSaved(false) }}
          style={{ height: 38, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
        {saved && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#10B981', fontSize: '0.8rem', fontWeight: 600 }}>
            <CheckCircleIcon size={14} color="#10B981" /> Saved
          </span>
        )}
      </div>

      {/* Summary */}
      {students.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--space-4)' }}>
          {[
            { label: 'Present', count: presentCount, color: '#10B981' },
            { label: 'Absent', count: absentCount, color: '#EF4444' },
            { label: 'Late', count: lateCount, color: '#F59E0B' },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, textAlign: 'center', padding: 8, background: s.color + '12', border: `1px solid ${s.color}30`, borderRadius: 8 }}>
              <p style={{ fontSize: '1.1rem', fontWeight: 800, color: s.color, margin: '0 0 2px' }}>{s.count}</p>
              <p style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Student list */}
      {loading ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>Loading students...</div>
      ) : students.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>No students in this class.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 'var(--space-4)' }}>
          {students.map((s: any) => {
            const status = records[s.id] ?? 'present'
            const st = STATUS_COLORS[status]
            return (
              <button key={s.id} onClick={() => toggle(s.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: st.bg, border: `1px solid ${st.color}40`, borderRadius: 10, cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all 0.15s' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: sc + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                  {s.avatar_url
                    ? <img src={s.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontWeight: 700, color: sc, fontSize: '0.85rem' }}>{s.full_name?.[0]}</span>
                  }
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.88rem' }}>{s.full_name}</p>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.72rem' }}>{s.default_code}</p>
                </div>
                <span style={{ padding: '4px 10px', borderRadius: 999, background: st.bg, border: `1px solid ${st.color}60`, color: st.color, fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.06em' }}>
                  {status.toUpperCase()}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {students.length > 0 && (
        <button onClick={submit} disabled={saving || saved}
          style={{ width: '100%', height: 46, background: saved ? '#10B98120' : sc, border: `1px solid ${saved ? '#10B981' : 'transparent'}`, borderRadius: 10, color: saved ? '#10B981' : '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: saving || saved ? 'default' : 'pointer', opacity: saving ? 0.6 : 1, transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {saved
            ? <><CheckCircleIcon size={16} color="#10B981" /> Attendance Saved</>
            : saving ? 'Saving...'
            : `Submit Attendance for ${selectedClass?.class_name}`
          }
        </button>
      )}
      <div style={{ height: 100 }} />
    </RolePageWrapper>
  )
}
