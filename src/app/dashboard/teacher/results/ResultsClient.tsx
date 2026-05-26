'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { BarChartIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

export default function ResultsClient({ profile, school, userId }: Props) {
  const [results,   setResults]   = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [term,      setTerm]      = useState('1st Term')
  const [subject,   setSubject]   = useState('')
  const [classLevel,setClassLevel]= useState('')
  const [editing,   setEditing]   = useState<string|null>(null)
  const [editScore, setEditScore] = useState('')
  const supabase    = createClient()
  const schoolColor = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [term, subject, classLevel])

  async function load() {
    setLoading(true)
    let q = supabase.from('results')
      .select('id, student:profiles(full_name, default_code), subject, score, max_score, grade, term')
      .eq('teacher_id', userId).eq('term', term)
    if (subject)    q = q.eq('subject', subject)
    if (classLevel) q = q.eq('class_level', classLevel)
    const { data } = await q.order('student(full_name)').limit(50)
    if (data) setResults(data)
    setLoading(false)
  }

  async function saveScore(id: string) {
    const score = parseFloat(editScore)
    if (isNaN(score)) return
    await supabase.from('results').update({ score, grade: scoreToGrade(score) }).eq('id', id)
    setResults(prev => prev.map(r => r.id===id ? { ...r, score, grade:scoreToGrade(score) } : r))
    setEditing(null)
  }

  function scoreToGrade(s: number) {
    if (s >= 70) return 'A'; if (s >= 60) return 'B'
    if (s >= 50) return 'C'; if (s >= 45) return 'D'; return 'F'
  }

  function gradeColor(g: string) {
    if (g==='A') return '#10B981'; if (g==='B') return '#3B82F6'
    if (g==='C') return '#F59E0B'; if (g==='D') return '#F97316'; return '#EF4444'
  }

  return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Results">
      <div style={{ display:'flex', gap:'var(--space-2)', marginBottom:'var(--space-5)', flexWrap:'wrap' }}>
        {['1st Term','2nd Term','3rd Term'].map(t => (
          <button key={t} onClick={() => setTerm(t)}
            className={`${styles.tab} ${term===t ? styles.tabActive : ''}`}
            style={term===t ? { background:schoolColor, color:'#fff', borderColor:schoolColor } : {}}>
            {t}
          </button>
        ))}
      </div>

      {loading ? <div className={styles.loading}><span/><span/><span/></div>
      : results.length === 0
        ? <div className={styles.empty}><BarChartIcon size={40} color="var(--text-faint)" strokeWidth={1}/><p>No results for {term}</p></div>
        : <div className={styles.tableWrap ?? ''}>
            <table className={styles.table}>
              <thead><tr>
                <th className={styles.th}>Student</th>
                <th className={styles.th}>Code</th>
                <th className={styles.th}>Subject</th>
                <th className={styles.th}>Score</th>
                <th className={styles.th}>Grade</th>
                <th className={styles.th}>Action</th>
              </tr></thead>
              <tbody>
                {results.map(r => (
                  <tr key={r.id}>
                    <td className={styles.td}>{(r.student as any)?.full_name ?? '—'}</td>
                    <td className={styles.td} style={{ fontFamily:'monospace', fontSize:'0.78rem' }}>{(r.student as any)?.default_code ?? '—'}</td>
                    <td className={styles.td}>{r.subject}</td>
                    <td className={styles.td}>
                      {editing === r.id
                        ? <input type="number" value={editScore} onChange={e => setEditScore(e.target.value)}
                            onKeyDown={e => { if(e.key==='Enter') saveScore(r.id); if(e.key==='Escape') setEditing(null) }}
                            style={{ width:60, height:30, padding:'0 6px', background:'var(--input-bg)', border:'1px solid var(--brand)', borderRadius:6, color:'var(--text-primary)', fontSize:'0.85rem', outline:'none' }}
                            autoFocus/>
                        : <span>{r.score}/{r.max_score ?? 100}</span>
                      }
                    </td>
                    <td className={styles.td}>
                      <span style={{ fontWeight:700, color:gradeColor(r.grade) }}>{r.grade}</span>
                    </td>
                    <td className={styles.td}>
                      {editing === r.id
                        ? <button onClick={() => saveScore(r.id)} style={{ fontSize:'0.72rem', fontWeight:700, color:'#10B981', background:'none', border:'none', cursor:'pointer' }}>Save</button>
                        : <button onClick={() => { setEditing(r.id); setEditScore(String(r.score)) }} style={{ fontSize:'0.72rem', fontWeight:700, color:schoolColor, background:'none', border:'none', cursor:'pointer' }}>Edit</button>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      }
      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}
