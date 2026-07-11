'use client'
// src/app/dashboard/teacher/report-cards/ReportCardsClient.tsx

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'

const TERMS = [
  { value: 'first',  label: 'First Term' },
  { value: 'second', label: 'Second Term' },
  { value: 'third',  label: 'Third Term' },
]

export default function ReportCardsClient({ profile, school, teacherId, classes, students }: any) {
  const supabase = createClient()
  const sc = school?.primary_color ?? '#7C3AED'

  const [classId, setClassId] = useState(classes?.[0]?.id ?? '')
  const [term, setTerm] = useState('first')
  const [academicYear, setAcademicYear] = useState(() => {
    const y = new Date().getFullYear()
    return `${y}/${y + 1}`
  })
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [remarks, setRemarks] = useState<Record<string, string>>({})
  const [statuses, setStatuses] = useState<Record<string, string>>({})
  const [rowIds, setRowIds] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const classStudents = students.filter((s: any) => s.class_id === classId)

  useEffect(() => {
    if (!classId) return
    setLoading(true)
    supabase
      .from('report_cards')
      .select('id, student_id, class_teacher_remark, status, attendance_start_date, attendance_end_date')
      .eq('class_id', classId)
      .eq('term', term)
      .eq('academic_year', academicYear)
      .then(({ data }) => {
        const r: Record<string, string> = {}
        const st: Record<string, string> = {}
        const ids: Record<string, string> = {}
        ;(data ?? []).forEach((row: any) => {
          r[row.student_id] = row.class_teacher_remark ?? ''
          st[row.student_id] = row.status
          ids[row.student_id] = row.id
          if (row.attendance_start_date) setStartDate(row.attendance_start_date)
          if (row.attendance_end_date) setEndDate(row.attendance_end_date)
        })
        setRemarks(r)
        setStatuses(st)
        setRowIds(ids)
        setLoading(false)
      })
  }, [classId, term, academicYear])

  async function submitForStudent(studentId: string) {
    setSavingId(studentId)
    setError(null)
    const existingId = rowIds[studentId]
    const payload = {
      student_id: studentId,
      class_id: classId,
      school_id: school?.id,
      term,
      academic_year: academicYear,
      attendance_start_date: startDate || null,
      attendance_end_date: endDate || null,
      class_teacher_remark: remarks[studentId] ?? '',
      status: 'pending_approval',
      generated_by: teacherId,
    }
    const { data, error: err } = existingId
      ? await supabase.from('report_cards').update(payload).eq('id', existingId).select('id').single()
      : await supabase.from('report_cards').insert(payload).select('id').single()

    if (err) {
      setError(err.message)
    } else {
      setStatuses(s => ({ ...s, [studentId]: 'pending_approval' }))
      if (data) setRowIds(ids => ({ ...ids, [studentId]: data.id }))
    }
    setSavingId(null)
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: 'var(--space-4)' }}>
      <DashboardHeader profile={profile} school={school} userId={teacherId} role="teacher" title="Report Cards" />

      {classes.length > 1 && (
        <select value={classId} onChange={e => setClassId(e.target.value)} className="input" style={{ marginBottom: 12 }}>
          {classes.map((c: any) => <option key={c.id} value={c.id}>{c.name ?? c.class_level}</option>)}
        </select>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {TERMS.map(t => (
          <button key={t.value} onClick={() => setTerm(t.value)}
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600,
              border: `1px solid ${term === t.value ? sc : 'var(--glass-border)'}`,
              background: term === t.value ? sc : 'transparent',
              color: term === t.value ? '#fff' : 'var(--text-muted)',
            }}>
            {t.label}
          </button>
        ))}
        <input value={academicYear} onChange={e => setAcademicYear(e.target.value)}
          placeholder="2025/2026" className="input" style={{ width: 110 }} />
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <div>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Attendance from</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input" />
        </div>
        <div>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Attendance to</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input" />
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #EF4444', borderRadius: 8, padding: '10px 14px', marginBottom: 14, color: '#EF4444', fontSize: '0.82rem' }}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : classStudents.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No students in this class yet.</p>
      ) : (
        classStudents.map((s: any) => {
          const status = statuses[s.id] ?? 'draft'
          const locked = status === 'approved'
          return (
            <div key={s.id} style={{ border: '1px solid var(--glass-border)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <strong>{s.full_name}</strong>
                <span style={{
                  fontSize: '0.72rem', fontWeight: 700, padding: '2px 10px', borderRadius: 999,
                  background: locked ? '#10B98122' : status === 'pending_approval' ? '#F59E0B22' : 'var(--glass-border)',
                  color: locked ? '#10B981' : status === 'pending_approval' ? '#F59E0B' : 'var(--text-muted)',
                }}>
                  {locked ? 'Approved' : status === 'pending_approval' ? 'Pending Principal Approval' : 'Draft'}
                </span>
              </div>
              <textarea
                value={remarks[s.id] ?? ''}
                onChange={e => setRemarks(r => ({ ...r, [s.id]: e.target.value }))}
                disabled={locked}
                placeholder="Class teacher's remark for this student…"
                className="input"
                style={{ width: '100%', minHeight: 60, marginBottom: 8 }}
              />
              <button
                onClick={() => submitForStudent(s.id)}
                disabled={locked || savingId === s.id}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: 'none', fontWeight: 700,
                  background: locked ? 'var(--glass-border)' : sc, color: locked ? 'var(--text-muted)' : '#fff',
                  cursor: locked ? 'not-allowed' : 'pointer',
                }}
              >
                {savingId === s.id ? 'Submitting…' : locked ? 'Already Approved' : 'Submit for Approval'}
              </button>
            </div>
          )
        })
      )}
    </div>
  )
}
