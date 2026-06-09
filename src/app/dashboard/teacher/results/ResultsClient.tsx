'use client'
// src/app/dashboard/teacher/results/ResultsClient.tsx
// MVP: Post scores by class_subject_id (correct schema join), view results, edit scores.
// FIXED: term values match DB ('First Term'/'Second Term'/'Third Term')
// FIXED: upsert on correct conflict key (class_subject_id, student_id, term, result_type)
// FIXED: student lookup via profiles.class_id (not student_profiles)
// FIXED: grade auto-calc and inline edit

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { BarChartIcon, CheckCircleIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface TeacherClass {
  class_id:         string
  class_name:       string
  class_level:      string
  subject:          string
  class_subject_id: string | null
}

interface Props {
  profile:       any
  school:        any
  userId:        string
  teacherClasses: TeacherClass[]
}

const TERMS        = ['First Term', 'Second Term', 'Third Term']
const RESULT_TYPES = [
  { value: 'day_test',  label: 'Day Test'  },
  { value: 'mid_term',  label: 'Mid-Term'  },
  { value: 'exam',      label: 'Exam'      },
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

const currentYear = `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`

export default function ResultsClient({ profile, school, userId, teacherClasses }: Props) {
  const [selectedClass,    setSelectedClass]   = useState<TeacherClass | null>(teacherClasses[0] ?? null)
  const [students,         setStudents]         = useState<any[]>([])
  const [existingResults,  setExistingResults]  = useState<any[]>([])
  const [scores,           setScores]           = useState<Record<string, string>>({})
  const [maxScore,         setMaxScore]         = useState(100)
  const [term,             setTerm]             = useState('First Term')
  const [resultType,       setResultType]       = useState('exam')
  const [mode,             setMode]             = useState<'view' | 'post'>('view')
  const [studentsLoading,  setStudentsLoading]  = useState(false)
  const [resultsLoading,   setResultsLoading]   = useState(false)
  const [submitting,       setSubmitting]       = useState(false)
  const [saved,            setSaved]            = useState(false)
  const [editingId,        setEditingId]        = useState<string | null>(null)
  const [editScore,        setEditScore]        = useState('')
  const [error,            setError]            = useState<string | null>(null)
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  // Load students when class changes
  useEffect(() => {
    if (!selectedClass) return
    loadStudents(selectedClass.class_id)
  }, [selectedClass])

  // Load results when class/term/type changes
  useEffect(() => {
    if (!selectedClass) return
    loadResults()
  }, [selectedClass, term, resultType])

  async function loadStudents(classId: string) {
    setStudentsLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, admission_number, default_code')
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
    setStudentsLoading(false)
  }

  async function loadResults() {
    if (!selectedClass?.class_subject_id) {
      setExistingResults([])
      return
    }
    setResultsLoading(true)
    const { data } = await supabase
      .from('results')
      .select('id, student_id, score, max_score, grade, remarks')
      .eq('class_subject_id', selectedClass.class_subject_id)
      .eq('term', term)
      .eq('result_type', resultType)
    if (data) setExistingResults(data)
    setResultsLoading(false)
  }

  async function submitResults() {
    if (!selectedClass?.class_subject_id) {
      setError('This class has no subject assignment yet. Ask your principal to assign subjects to classes.')
      return
    }
    setError(null)
    const filled = students.filter(s => scores[s.id] !== '' && scores[s.id] !== undefined)
    if (!filled.length) { setError('Enter at least one score before submitting.'); return }

    setSubmitting(true)
    const rows = filled.map(s => ({
      class_subject_id: selectedClass.class_subject_id,
      student_id:       s.id,
      school_id:        school?.id,
      term,
      academic_year:    currentYear,
      result_type:      resultType,
      score:            Math.min(parseFloat(scores[s.id]) || 0, maxScore),
      max_score:        maxScore,
      grade:            scoreToGrade(parseFloat(scores[s.id]) || 0, maxScore),
      posted_by:        userId,
    }))

    const { error: upsertErr } = await supabase
      .from('results')
      .upsert(rows, { onConflict: 'class_subject_id,student_id,term,result_type' })

    setSubmitting(false)
    if (upsertErr) {
      setError(`Save failed: ${upsertErr.message}`)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      setMode('view')
      loadResults()
    }
  }

  async function saveEdit(resultId: string) {
    const score = parseFloat(editScore)
    if (isNaN(score)) return
    const result = existingResults.find(r => r.id === resultId)
    const max    = result?.max_score ?? 100
    await supabase.from('results').update({
      score,
      grade: scoreToGrade(score, max),
    }).eq('id', resultId)
    setExistingResults(prev =>
      prev.map(r => r.id === resultId ? { ...r, score, grade: scoreToGrade(score, max) } : r)
    )
    setEditingId(null)
  }

  const resultMap: Record<string, any> = {}
  existingResults.forEach(r => { resultMap[r.student_id] = r })

  const avg = existingResults.length
    ? Math.round(existingResults.reduce((s, r) => s + (r.score / (r.max_score || 100)) * 100, 0) / existingResults.length)
    : 0
  const passCount = existingResults.filter(r => r.grade !== 'F').length

  if (!teacherClasses.length) return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Results">
      <div className={styles.empty}>
        <BarChartIcon size={40} color="var(--text-faint)" strokeWidth={1} />
        <p>No classes assigned yet. Contact your principal.</p>
      </div>
    </RolePageWrapper>
  )

  return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Results">

      {/* Class selector (pills if multiple) */}
      {teacherClasses.length > 1 && (
        <div style={{ overflowX: 'auto', display: 'flex', gap: 8, marginBottom: 'var(--space-4)', paddingBottom: 4 }}>
          {teacherClasses.map(cls => (
            <button
              key={cls.class_id}
              onClick={() => { setSelectedClass(cls); setMode('view') }}
              style={{
                flexShrink: 0, padding: '6px 14px', borderRadius: 999, cursor: 'pointer',
                border:      `1px solid ${selectedClass?.class_id === cls.class_id ? sc : sc + '40'}`,
                background:  selectedClass?.class_id === cls.class_id ? sc : 'transparent',
                color:       selectedClass?.class_id === cls.class_id ? '#fff' : sc,
                fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap',
              }}>
              {cls.class_name}{cls.subject ? ` · ${cls.subject}` : ''}
            </button>
          ))}
        </div>
      )}

      {/* Term tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--space-3)', flexWrap: 'wrap' }}>
        {TERMS.map(t => (
          <button key={t} onClick={() => setTerm(t)} style={{
            padding: '6px 14px', borderRadius: 999, cursor: 'pointer',
            border:     `1px solid ${term === t ? sc : 'var(--glass-border)'}`,
            background: term === t ? sc : 'transparent',
            color:      term === t ? '#fff' : 'var(--text-muted)',
            fontSize: '0.78rem', fontWeight: 700,
          }}>{t}</button>
        ))}
      </div>

      {/* Result type tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        {RESULT_TYPES.map(rt => (
          <button key={rt.value} onClick={() => setResultType(rt.value)} style={{
            padding: '5px 12px', borderRadius: 999, cursor: 'pointer',
            border:     `1px solid ${resultType === rt.value ? sc + '80' : 'var(--glass-border)'}`,
            background: resultType === rt.value ? sc + '20' : 'transparent',
            color:      resultType === rt.value ? sc : 'var(--text-muted)',
            fontSize: '0.75rem', fontWeight: 700,
          }}>{rt.label}</button>
        ))}
      </div>

      {/* Mode toggle + saved indicator */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['view', 'post'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
              border:     `1px solid ${mode === m ? sc : 'var(--glass-border)'}`,
              background: mode === m ? sc : 'transparent',
              color:      mode === m ? '#fff' : 'var(--text-muted)',
              fontSize: '0.78rem', fontWeight: 700,
            }}>
              {m === 'view' ? '📊 View' : '✏️ Post Scores'}
            </button>
          ))}
        </div>
        {saved && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#10B981', fontSize: '0.8rem', fontWeight: 600 }}>
            <CheckCircleIcon size={14} color="#10B981" /> Saved!
          </span>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ padding: '10px 14px', marginBottom: 'var(--space-4)', background: '#EF444420', border: '1px solid #EF444440', borderRadius: 8, fontSize: '0.8rem', color: '#EF4444' }}>
          {error}
        </div>
      )}

      {/* No class_subject_id warning */}
      {selectedClass && !selectedClass.class_subject_id && (
        <div style={{ padding: '10px 14px', marginBottom: 'var(--space-4)', background: '#F59E0B20', border: '1px solid #F59E0B40', borderRadius: 8, fontSize: '0.8rem', color: '#F59E0B' }}>
          ⚠️ No subject record linked to <strong>{selectedClass.class_name}</strong>. A principal must assign subjects to classes before results can be posted.
        </div>
      )}

      {/* Stats (view mode) */}
      {!resultsLoading && existingResults.length > 0 && mode === 'view' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 'var(--space-4)' }}>
          {[
            { label: 'Entries', value: existingResults.length, color: sc },
            { label: 'Avg Score', value: `${avg}%`,            color: avg >= 60 ? '#10B981' : '#EF4444' },
            { label: 'Passes',   value: passCount,             color: '#10B981' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center', padding: 10, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 8 }}>
              <p style={{ margin: '0 0 2px', fontSize: '1.15rem', fontWeight: 800, color: s.color }}>{s.value}</p>
              <p style={{ margin: 0, fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* POST MODE */}
      {mode === 'post' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--space-4)' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Max Score:</label>
            <input
              type="number" min={1} value={maxScore}
              onChange={e => setMaxScore(Number(e.target.value))}
              style={{ width: 70, height: 36, padding: '0 10px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }}
            />
          </div>

          {studentsLoading ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading students…</p>
          ) : students.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No students enrolled in this class yet.</p>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 'var(--space-4)' }}>
                {students.map(s => {
                  const prev = resultMap[s.id]
                  return (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 10 }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>{s.full_name}</p>
                        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.72rem' }}>{s.admission_number ?? s.default_code ?? '—'}</p>
                      </div>
                      {prev && (
                        <span style={{ fontSize: '0.7rem', color: '#10B981', fontWeight: 700, flexShrink: 0 }}>
                          prev: {prev.score}/{prev.max_score}
                        </span>
                      )}
                      <input
                        type="number" min={0} max={maxScore}
                        value={scores[s.id] ?? ''}
                        onChange={e => setScores(prev => ({ ...prev, [s.id]: e.target.value }))}
                        placeholder={prev ? String(prev.score) : '—'}
                        style={{ width: 70, height: 36, padding: '0 8px', background: 'var(--input-bg)', border: `1px solid ${scores[s.id] ? sc : 'var(--input-border)'}`, borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', textAlign: 'center' }}
                      />
                    </div>
                  )
                })}
              </div>

              <button
                onClick={submitResults}
                disabled={submitting || !selectedClass?.class_subject_id}
                style={{ width: '100%', height: 46, background: sc, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '0.9rem', cursor: submitting ? 'default' : 'pointer', opacity: (submitting || !selectedClass?.class_subject_id) ? 0.55 : 1 }}>
                {submitting ? 'Saving…' : `Save ${RESULT_TYPES.find(r => r.value === resultType)?.label} Scores`}
              </button>
            </>
          )}
        </>
      )}

      {/* VIEW MODE */}
      {mode === 'view' && (
        resultsLoading ? (
          <div style={{ display: 'flex', gap: 5, padding: '30px 0', justifyContent: 'center' }}>
            {[0,1,2].map(i => <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: sc, animation: 'bounce 1.2s ease infinite', animationDelay: `${i * 0.2}s` }} />)}
          </div>
        ) : existingResults.length === 0 ? (
          <div className={styles.empty}>
            <BarChartIcon size={40} color="var(--text-faint)" strokeWidth={1} />
            <p>No results posted yet for {selectedClass?.class_name} · {term} · {RESULT_TYPES.find(r => r.value === resultType)?.label}</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  {['Student', 'Adm. No.', 'Score', 'Grade', ''].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {existingResults.map(r => {
                  const stu = students.find(s => s.id === r.student_id)
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                      <td style={{ padding: '10px', fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                        {stu?.full_name ?? '—'}
                      </td>
                      <td style={{ padding: '10px', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {stu?.admission_number ?? stu?.default_code ?? '—'}
                      </td>
                      <td style={{ padding: '10px', fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                        {editingId === r.id ? (
                          <input
                            type="number" value={editScore}
                            onChange={e => setEditScore(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(r.id); if (e.key === 'Escape') setEditingId(null) }}
                            style={{ width: 60, height: 30, padding: '0 6px', background: 'var(--input-bg)', border: `1px solid ${sc}`, borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }}
                            autoFocus
                          />
                        ) : (
                          <span>{r.score}/{r.max_score ?? 100}</span>
                        )}
                      </td>
                      <td style={{ padding: '10px' }}>
                        <span style={{ fontWeight: 800, color: gradeColor(r.grade), fontSize: '0.88rem' }}>{r.grade}</span>
                      </td>
                      <td style={{ padding: '10px' }}>
                        {editingId === r.id ? (
                          <button onClick={() => saveEdit(r.id)} style={{ fontSize: '0.72rem', fontWeight: 700, color: '#10B981', background: 'none', border: 'none', cursor: 'pointer' }}>Save</button>
                        ) : (
                          <button onClick={() => { setEditingId(r.id); setEditScore(String(r.score)) }} style={{ fontSize: '0.72rem', fontWeight: 700, color: sc, background: 'none', border: 'none', cursor: 'pointer' }}>Edit</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      <div className={styles.spacer} />
    </RolePageWrapper>
  )
}
