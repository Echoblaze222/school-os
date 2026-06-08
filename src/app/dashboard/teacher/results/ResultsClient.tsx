'use client'
// FIXED: uses posted_by (not teacher_id), resolves class_subject_id properly
// FIXED: post new results + edit existing scores

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { BarChartIcon, PlusIcon, CheckCircleIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

interface TeacherClass {
  class_id: string
  class_name: string
  subject: string | null
  class_subject_id: string | null
}

const RESULT_TYPES = [
  { value: 'day_test', label: 'Day Test' },
  { value: 'mid_term', label: 'Mid-Term' },
  { value: 'exam',     label: 'Exam' },
]

function scoreToGrade(score: number, max: number): string {
  const pct = max > 0 ? (score / max) * 100 : 0
  if (pct >= 75) return 'A'
  if (pct >= 65) return 'B'
  if (pct >= 50) return 'C'
  if (pct >= 40) return 'D'
  return 'F'
}

function gradeColor(g: string) {
  if (g === 'A') return '#10B981'
  if (g === 'B') return '#3B82F6'
  if (g === 'C') return '#F59E0B'
  if (g === 'D') return '#F97316'
  return '#EF4444'
}

export default function ResultsClient({ profile, school, userId }: Props) {
  const [teacherClasses, setTeacherClasses] = useState<TeacherClass[]>([])
  const [selectedClass, setSelectedClass] = useState<TeacherClass | null>(null)
  const [students, setStudents] = useState<any[]>([])
  const [existingResults, setExistingResults] = useState<any[]>([])
  const [scores, setScores] = useState<Record<string, string>>({})
  const [maxScore, setMaxScore] = useState(100)
  const [term, setTerm] = useState('1st Term')
  const [resultType, setResultType] = useState('exam')
  const [academicYear] = useState(`${new Date().getFullYear()}/${new Date().getFullYear() + 1}`)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [mode, setMode] = useState<'view' | 'post'>('view')
  const [editing, setEditing] = useState<string | null>(null)
  const [editScore, setEditScore] = useState('')
  const supabase = createClient()
  const sc = school?.primary_color ?? '#7C3AED'

  useEffect(() => { loadTeacherClasses() }, [])
  useEffect(() => {
    if (selectedClass) {
      loadStudents(selectedClass.class_id)
      loadResults()
    }
  }, [selectedClass, term, resultType])

  async function loadTeacherClasses() {
    setLoading(true)
    const { data: ct } = await supabase
      .from('class_teachers')
      .select('class_id, subject, classes(name)')
      .eq('teacher_id', userId)
      .eq('school_id', school?.id)

    if (!ct?.length) { setLoading(false); return }

    const list: TeacherClass[] = await Promise.all(
      ct.map(async (row: any) => {
        const { data: cs } = await supabase
          .from('class_subjects')
          .select('id')
          .eq('class_id', row.class_id)
          .limit(1)
          .maybeSingle()
        return {
          class_id: row.class_id,
          class_name: row.classes?.name ?? '',
          subject: row.subject,
          class_subject_id: cs?.id ?? null,
        }
      })
    )
    setTeacherClasses(list)
    setSelectedClass(list[0])
    setLoading(false)
  }

  async function loadStudents(classId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, default_code')
      .eq('class_id', classId)
      .eq('school_id', school?.id)
      .eq('role', 'student')
      .order('full_name')
    if (data) {
      setStudents(data)
      const init: Record<string, string> = {}
      data.forEach((s: any) => { init[s.id] = '' })
      setScores(init)
    }
  }

  async function loadResults() {
    if (!selectedClass?.class_subject_id) return
    const { data } = await supabase
      .from('results')
      .select('id, student_id, score, max_score, grade, result_type, term')
      .eq('class_subject_id', selectedClass.class_subject_id)
      .eq('term', term)
      .eq('result_type', resultType)
      .eq('school_id', school?.id)
    if (data) setExistingResults(data)
  }

  async function submitResults() {
    if (!selectedClass?.class_subject_id) {
      alert('No class_subject found. Please ensure subjects are assigned to classes.')
      return
    }
    const filled = students.filter(s => scores[s.id] !== '' && scores[s.id] !== undefined)
    if (!filled.length) return

    setSubmitting(true)
    const rows = filled.map(s => ({
      class_subject_id: selectedClass.class_subject_id,
      student_id: s.id,
      school_id: school?.id,
      term,
      academic_year: academicYear,
      result_type: resultType,
      score: parseFloat(scores[s.id]) || 0,
      max_score: maxScore,
      grade: scoreToGrade(parseFloat(scores[s.id]) || 0, maxScore),
      posted_by: userId,  // FIXED: posted_by not teacher_id
    }))

    const { error } = await supabase.from('results').upsert(rows, {
      onConflict: 'class_subject_id,student_id,term,result_type',
    })
    if (error) console.error('Results error:', error)
    setSubmitting(false)
    setSubmitted(true)
    setMode('view')
    loadResults()
    setTimeout(() => setSubmitted(false), 3000)
  }

  async function saveEdit(resultId: string) {
    const score = parseFloat(editScore)
    if (isNaN(score)) return
    const result = existingResults.find(r => r.id === resultId)
    await supabase.from('results').update({
      score,
      grade: scoreToGrade(score, result?.max_score ?? 100),
    }).eq('id', resultId)
    setExistingResults(prev => prev.map(r =>
      r.id === resultId ? { ...r, score, grade: scoreToGrade(score, r.max_score ?? 100) } : r
    ))
    setEditing(null)
  }

  // Merge students with existing results for the view
  const studentResultMap: Record<string, any> = {}
  existingResults.forEach(r => { studentResultMap[r.student_id] = r })

  const avg = existingResults.length
    ? Math.round(existingResults.reduce((s, r) => s + (r.score / (r.max_score || 100)) * 100, 0) / existingResults.length)
    : 0

  if (loading) return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Results">
      <div className={styles.loading}><span /><span /><span /></div>
    </RolePageWrapper>
  )

  if (!teacherClasses.length) return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Results">
      <div className={styles.empty}><BarChartIcon size={40} color="var(--text-faint)" strokeWidth={1} /><p>No classes assigned yet.</p></div>
    </RolePageWrapper>
  )

  return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Results">

      {/* Class pills */}
      {teacherClasses.length > 1 && (
        <div style={{ overflowX: 'auto', display: 'flex', gap: 8, marginBottom: 'var(--space-4)', paddingBottom: 4 }}>
          {teacherClasses.map(cls => (
            <button key={cls.class_id} onClick={() => { setSelectedClass(cls); setMode('view') }}
              style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 999, border: `1px solid ${selectedClass?.class_id === cls.class_id ? sc : sc + '40'}`, background: selectedClass?.class_id === cls.class_id ? sc : 'transparent', color: selectedClass?.class_id === cls.class_id ? '#fff' : sc, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {cls.class_name}{cls.subject ? ` · ${cls.subject}` : ''}
            </button>
          ))}
        </div>
      )}

      {/* Term tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--space-3)', flexWrap: 'wrap' }}>
        {['1st Term', '2nd Term', '3rd Term'].map(t => (
          <button key={t} onClick={() => setTerm(t)}
            style={{ padding: '6px 14px', borderRadius: 999, border: `1px solid ${term === t ? sc : 'var(--glass-border)'}`, background: term === t ? sc : 'transparent', color: term === t ? '#fff' : 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
            {t}
          </button>
        ))}
      </div>

      {/* Result type tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        {RESULT_TYPES.map(rt => (
          <button key={rt.value} onClick={() => setResultType(rt.value)}
            style={{ padding: '5px 12px', borderRadius: 999, border: `1px solid ${resultType === rt.value ? sc + '80' : 'var(--glass-border)'}`, background: resultType === rt.value ? sc + '20' : 'transparent', color: resultType === rt.value ? sc : 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
            {rt.label}
          </button>
        ))}
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['view', 'post'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${mode === m ? sc : 'var(--glass-border)'}`, background: mode === m ? sc : 'transparent', color: mode === m ? '#fff' : 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
              {m === 'view' ? '📊 View Results' : '✏️ Post Scores'}
            </button>
          ))}
        </div>
        {submitted && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#10B981', fontSize: '0.8rem', fontWeight: 600 }}>
            <CheckCircleIcon size={14} color="#10B981" /> Saved!
          </span>
        )}
      </div>

      {/* Stats bar */}
      {existingResults.length > 0 && mode === 'view' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 'var(--space-4)' }}>
          {[
            { label: 'Students', value: existingResults.length, color: sc },
            { label: 'Avg Score', value: `${avg}%`, color: avg >= 60 ? '#10B981' : '#EF4444' },
            { label: 'Passes', value: existingResults.filter(r => r.grade !== 'F').length, color: '#10B981' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center', padding: 10, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 8 }}>
              <p style={{ margin: '0 0 2px', fontSize: '1.2rem', fontWeight: 800, color: s.color }}>{s.value}</p>
              <p style={{ margin: 0, fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Post mode */}
      {mode === 'post' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--space-4)' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Max Score:</label>
            <input type="number" min={1} value={maxScore} onChange={e => setMaxScore(Number(e.target.value))}
              style={{ width: 70, height: 36, padding: '0 10px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
          </div>
          {students.length === 0
            ? <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No students in this class.</p>
            : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 'var(--space-4)' }}>
                  {students.map(s => {
                    const existing = studentResultMap[s.id]
                    return (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 10 }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>{s.full_name}</p>
                          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.72rem' }}>{s.default_code}</p>
                        </div>
                        {existing && (
                          <span style={{ fontSize: '0.7rem', color: '#10B981', fontWeight: 700, flexShrink: 0 }}>
                            {existing.score}/{existing.max_score}
                          </span>
                        )}
                        <input type="number" min={0} max={maxScore}
                          value={scores[s.id] ?? ''}
                          onChange={e => setScores(prev => ({ ...prev, [s.id]: e.target.value }))}
                          placeholder={existing ? String(existing.score) : '—'}
                          style={{ width: 70, height: 36, padding: '0 8px', background: 'var(--input-bg)', border: `1px solid ${scores[s.id] ? sc : 'var(--input-border)'}`, borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', textAlign: 'center' }} />
                      </div>
                    )
                  })}
                </div>
                <button onClick={submitResults} disabled={submitting}
                  style={{ width: '100%', height: 46, background: sc, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '0.9rem', cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.6 : 1 }}>
                  {submitting ? 'Saving...' : `Submit ${RESULT_TYPES.find(r => r.value === resultType)?.label} Scores`}
                </button>
              </>
            )}
        </>
      )}

      {/* View mode */}
      {mode === 'view' && (
        existingResults.length === 0
          ? <div className={styles.empty}><BarChartIcon size={40} color="var(--text-faint)" strokeWidth={1} /><p>No results posted for {selectedClass?.class_name} · {term} · {RESULT_TYPES.find(r => r.value === resultType)?.label}</p></div>
          : <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  {['Student', 'Code', 'Score', 'Grade', ''].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {existingResults.map(r => {
                  const stu = students.find(s => s.id === r.student_id) ?? { full_name: '—', default_code: '—' }
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                      <td style={{ padding: '10px', fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>{stu.full_name}</td>
                      <td style={{ padding: '10px', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{stu.default_code}</td>
                      <td style={{ padding: '10px', fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                        {editing === r.id
                          ? <input type="number" value={editScore} onChange={e => setEditScore(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveEdit(r.id); if (e.key === 'Escape') setEditing(null) }}
                              style={{ width: 60, height: 30, padding: '0 6px', background: 'var(--input-bg)', border: `1px solid ${sc}`, borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }}
                              autoFocus />
                          : <span>{r.score}/{r.max_score ?? 100}</span>
                        }
                      </td>
                      <td style={{ padding: '10px' }}>
                        <span style={{ fontWeight: 800, color: gradeColor(r.grade), fontSize: '0.88rem' }}>{r.grade}</span>
                      </td>
                      <td style={{ padding: '10px' }}>
                        {editing === r.id
                          ? <button onClick={() => saveEdit(r.id)} style={{ fontSize: '0.72rem', fontWeight: 700, color: '#10B981', background: 'none', border: 'none', cursor: 'pointer' }}>Save</button>
                          : <button onClick={() => { setEditing(r.id); setEditScore(String(r.score)) }} style={{ fontSize: '0.72rem', fontWeight: 700, color: sc, background: 'none', border: 'none', cursor: 'pointer' }}>Edit</button>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
      )}
      <div className={styles.spacer} />
    </RolePageWrapper>
  )
}
