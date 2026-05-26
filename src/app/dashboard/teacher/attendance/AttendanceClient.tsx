'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { CalendarIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

export default function AttendanceClient({ profile, school, userId }: Props) {
  const [students,   setStudents]   = useState<any[]>([])
  const [records,    setRecords]    = useState<Record<string, string>>({})
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(false)
  const [date,       setDate]       = useState(() => new Date().toISOString().split('T')[0])
  const [classLevel, setClassLevel] = useState('')
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  useEffect(() => { loadStudents() }, [classLevel])
  useEffect(() => { if (students.length) loadExisting() }, [students, date])

  async function loadStudents() {
    setLoading(true)
    let q = supabase
      .from('profiles')
      .select('id, full_name, default_code, class_level')
      .eq('school_id', school?.id)
      .eq('role', 'student')
      .order('full_name')
    if (classLevel) q = q.eq('class_level', classLevel)
    const { data } = await q.limit(80)
    if (data) {
      setStudents(data)
      const init: Record<string, string> = {}
      data.forEach(s => { init[s.id] = 'present' })
      setRecords(init)
    }
    setLoading(false)
  }

  async function loadExisting() {
    const { data } = await supabase
      .from('attendance')
      .select('student_id, status')
      .eq('school_id', school?.id)
      .eq('date', date)
      .in('student_id', students.map(s => s.id))
    if (data?.length) {
      const map: Record<string, string> = {}
      data.forEach(r => { map[r.student_id] = r.status })
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
    setSaving(true)
    const rows = students.map(s => ({
      school_id:  school?.id,
      student_id: s.id,
      teacher_id: userId,
      date,
      status:     records[s.id] ?? 'present',
    }))
    await supabase.from('attendance').upsert(rows, { onConflict: 'student_id,date,class_id' })
    setSaved(true)
    setSaving(false)
  }

  const STATUS = {
    present: { label: 'Present', color: '#10B981', bg: '#10B98120' },
    absent:  { label: 'Absent',  color: '#EF4444', bg: '#EF444420' },
    late:    { label: 'Late',    color: '#F59E0B', bg: '#F59E0B20' },
  }

  const counts = students.reduce((acc, s) => {
    const st = records[s.id] ?? 'present'
    acc[st] = (acc[st] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Attendance">

      {/* Controls */}
      <div style={{ display:'flex', gap:'var(--space-3)', marginBottom:'var(--space-5)', flexWrap:'wrap', alignItems:'center' }}>
        <input type="date" value={date} onChange={e => { setDate(e.target.value); setSaved(false) }}
          style={{ height:40, padding:'0 12px', background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:8, color:'var(--text-primary)', fontSize:'0.85rem', outline:'none' }}/>
        <input value={classLevel} onChange={e => setClassLevel(e.target.value)}
          placeholder="Filter by class level (e.g. JSS 2)"
          style={{ height:40, padding:'0 12px', background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:8, color:'var(--text-primary)', fontSize:'0.85rem', outline:'none', flex:1, minWidth:160 }}/>
      </div>

      {/* Stats */}
      {students.length > 0 && (
        <div className={styles.statsRow} style={{ marginBottom:'var(--space-5)' }}>
          {Object.entries(STATUS).map(([key, val]) => (
            <div key={key} className={styles.statCard}>
              <p className={styles.statVal} style={{ color:val.color }}>{counts[key] ?? 0}</p>
              <p className={styles.statLbl}>{val.label}</p>
            </div>
          ))}
          <div className={styles.statCard}>
            <p className={styles.statVal} style={{ color:sc }}>{students.length}</p>
            <p className={styles.statLbl}>Total</p>
          </div>
        </div>
      )}

      {students.length > 0 && (
        <p style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginBottom:'var(--space-3)' }}>
          Tap to cycle: <span style={{ color:'#10B981', fontWeight:700 }}>Present</span> → <span style={{ color:'#EF4444', fontWeight:700 }}>Absent</span> → <span style={{ color:'#F59E0B', fontWeight:700 }}>Late</span>
        </p>
      )}

      {loading ? <div className={styles.loading}><span/><span/><span/></div>
        : students.length === 0
          ? <div className={styles.empty}><CalendarIcon size={40} color="var(--text-faint)" strokeWidth={1}/><p>No students found{classLevel ? ` for "${classLevel}"` : ''}</p></div>
          : <>
            <div className={styles.list} style={{ marginBottom:'var(--space-5)' }}>
              {students.map(s => {
                const st   = records[s.id] ?? 'present'
                const info = STATUS[st as keyof typeof STATUS]
                return (
                  <div key={s.id} className={styles.card}
                    style={{ cursor:'pointer', borderLeft:`3px solid ${info.color}` }}
                    onClick={() => toggle(s.id)}>
                    <div className={styles.cardIcon} style={{ background:info.bg, borderRadius:'50%' }}>
                      <span style={{ fontWeight:800, color:info.color, fontSize:'0.85rem' }}>{s.full_name?.[0]}</span>
                    </div>
                    <div className={styles.cardBody}>
                      <p className={styles.cardTitle}>{s.full_name}</p>
                      <p className={styles.cardMeta}>{s.default_code}{s.class_level ? ` · ${s.class_level}` : ''}</p>
                    </div>
                    <span style={{ padding:'4px 12px', borderRadius:999, fontSize:'0.72rem', fontWeight:700, background:info.bg, color:info.color, flexShrink:0 }}>
                      {info.label}
                    </span>
                  </div>
                )
              })}
            </div>
            <button onClick={submit} disabled={saving}
              style={{ width:'100%', height:48, background:saved?'#10B981':sc, color:'#fff', border:'none', borderRadius:12, fontWeight:700, fontSize:'0.9rem', cursor:'pointer', opacity:saving?0.7:1, transition:'background 0.3s' }}>
              {saving ? 'Saving...' : saved ? '✅ Attendance Saved' : 'Submit Attendance'}
            </button>
          </>
      }
      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}
