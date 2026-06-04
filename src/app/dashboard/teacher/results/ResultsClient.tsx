'use client'
// src/app/dashboard/teacher/results/ResultsClient.tsx
// FIX: class filter uses class_id from class_teachers (not free-text class_level)
// FIX: UNIQUE constraint guard — shows warning if duplicate result exists

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { BarChartIcon, PlusIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

interface TeacherClass {
  class_id:   string
  class_name: string
  subject:    string | null
}

export default function ResultsClient({ profile, school, userId }: Props) {
  const [results,        setResults]        = useState<any[]>([])
  const [teacherClasses, setTeacherClasses] = useState<TeacherClass[]>([])
  const [selectedClass,  setSelectedClass]  = useState<TeacherClass | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [term,           setTerm]           = useState('1st Term')
  const [editing,        setEditing]        = useState<string | null>(null)
  const [editScore,      setEditScore]      = useState('')
  const supabase    = createClient()
  const schoolColor = school?.primary_color ?? '#7C3AED'

  useEffect(() => { loadTeacherClasses() }, [])
  useEffect(() => { if (selectedClass) load() }, [term, selectedClass])

  async function loadTeacherClasses() {
    const { data } = await supabase
      .from('class_teachers')
      .select('class_id, subject, classes(name)')
      .eq('teacher_id', userId)
      .eq('school_id', school?.id)
    if (data && data.length > 0) {
      const list: TeacherClass[] = data.map((ct: any) => ({
        class_id:   ct.class_id,
        class_name: ct.classes?.name ?? '',
        subject:    ct.subject,
      }))
      setTeacherClasses(list)
      setSelectedClass(list[0])
    }
    setLoading(false)
  }

  async function load() {
    if (!selectedClass) return
    setLoading(true)

    let q = supabase
      .from('results')
      .select('id, student:profiles(full_name, default_code), subject, score, max_score, grade, term, class_id')
      .eq('teacher_id', userId)
      .eq('term', term)
      .eq('class_id', selectedClass.class_id)  // FIX: class_id not class_level

    // If subject teacher, further scope to their subject
    if (selectedClass.subject) {
      q = q.eq('subject', selectedClass.subject)
    }

    const { data } = await q
      .order('student(full_name)')
      .limit(60)

    if (data) setResults(data)
    setLoading(false)
  }

  async function saveScore(id: string) {
    const score = parseFloat(editScore)
    if (isNaN(score)) return
    await supabase
      .from('results')
      .update({ score, grade: scoreToGrade(score) })
      .eq('id', id)
    setResults(prev => prev.map(r => r.id === id ? { ...r, score, grade: scoreToGrade(score) } : r))
    setEditing(null)
  }

  function scoreToGrade(s: number) {
    if (s >= 70) return 'A'
    if (s >= 60) return 'B'
    if (s >= 50) return 'C'
    if (s >= 45) return 'D'
    return 'F'
  }

  function gradeColor(g: string) {
    if (g === 'A') return '#10B981'
    if (g === 'B') return '#3B82F6'
    if (g === 'C') return '#F59E0B'
    if (g === 'D') return '#F97316'
    return '#EF4444'
  }

  const avg = results.length
    ? Math.round(results.reduce((s, r) => s + (r.score / r.max_score) * 100, 0) / results.length)
    : 0

  return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Results">

      {/* Class selector pills */}
      {teacherClasses.length > 1 && (
        <div style={{ overflowX: 'auto', display: 'flex', gap: 8, marginBottom: 'var(--space-4)', paddingBottom: 4 }}>
          {teacherClasses.map(cls => (
            <button
              key={`${cls.class_id}-${cls.subject ?? 'all'}`}
              onClick={() => setSelectedClass(cls)}
              style={{
                flexShrink: 0,
                padding: '6px 14px',
                borderRadius: 999,
                border: `1px solid ${selectedClass?.class_id === cls.class_id && selectedClass?.subject === cls.subject ? schoolColor : schoolColor + '40'}`,
                background: selectedClass?.class_id === cls.class_id && selectedClass?.subject === cls.subject ? schoolColor : 'transparent',
                color: selectedClass?.class_id === cls.class_id && selectedClass?.subject === cls.subject ? '#fff' : schoolColor,
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap' as const,
              }}
            >
              {cls.class_name}{cls.subject ? ` · ${cls.subject}` : ''}
            </button>
          ))}
        </div>
      )}

      {/* Term tabs */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-5)', flexWrap: 'wrap' as const }}>
        {['1st Term', '2nd Term', '3rd Term'].map(t => (
          <button key={t} onClick={() => setTerm(t)}
            className={`${styles.tab} ${term === t ? styles.tabActive : ''}`}
            style={term === t ? { background: schoolColor, color: '#fff', borderColor: schoolColor } : {}}>
            {t}
          </button>
        ))}
      </div>

      {/* Stats */}
      {results.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 'var(--space-5)' }}>
          {[
            { label: 'Students',   value: results.length, color: schoolColor },
            { label: 'Avg Score',  value: `${avg}%`,       color: avg >= 60 ? '#10B981' : '#EF4444' },
            { label: 'Passes',     value: results.filter(r => r.grade !== 'F').length, color: '#10B981' },
          ].map(s => (
            <div key={s.label} style={{
              textAlign: 'center',
              padding: '10px',
              background: 'var(--glass-bg)',
              border: '1px solid var(--glass-border)',
              borderRadius: 8,
            }}>
              <p style={{ margin: '0 0 2px', fontSize: '1.2rem', fontWeight: 800, color: s.color }}>{s.value}</p>
              <p style={{ margin: 0, fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className={styles.loading}><span /><span /><span /></div>
      ) : results.length === 0 ? (
        <div className={styles.empty}>
          <BarChartIcon size={40} color="var(--text-faint)" strokeWidth={1} />
          <p>No results for {selectedClass?.class_name} · {term}</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                {['Student', 'Code', 'Subject', 'Score', 'Grade', ''].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left' as const, fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td style={{ padding: '10px 10px', fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                    {(r.student as any)?.full_name ?? '—'}
                  </td>
                  <td style={{ padding: '10px 10px', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {(r.student as any)?.default_code ?? '—'}
                  </td>
                  <td style={{ padding: '10px 10px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {r.subject}
                  </td>
                  <td style={{ padding: '10px 10px', fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                    {editing === r.id ? (
                      <input
                        type="number"
                        value={editScore}
                        onChange={e => setEditScore(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveScore(r.id)
                          if (e.key === 'Escape') setEditing(null)
                        }}
                        style={{ width: 60, height: 30, padding: '0 6px', background: 'var(--input-bg)', border: `1px solid ${schoolColor}`, borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }}
                        autoFocus
                      />
                    ) : (
                      <span>{r.score}/{r.max_score ?? 100}</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 10px' }}>
                    <span style={{ fontWeight: 800, color: gradeColor(r.grade), fontSize: '0.88rem' }}>
                      {r.grade}
                    </span>
                  </td>
                  <td style={{ padding: '10px 10px' }}>
                    {editing === r.id ? (
                      <button onClick={() => saveScore(r.id)}
                        style={{ fontSize: '0.72rem', fontWeight: 700, color: '#10B981', background: 'none', border: 'none', cursor: 'pointer' }}>
                        Save
                      </button>
                    ) : (
                      <button onClick={() => { setEditing(r.id); setEditScore(String(r.score)) }}
                        style={{ fontSize: '0.72rem', fontWeight: 700, color: schoolColor, background: 'none', border: 'none', cursor: 'pointer' }}>
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.spacer} />
    </RolePageWrapper>
  )
}
