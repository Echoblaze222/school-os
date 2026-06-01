'use client'
// ResultsClient.tsx
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import StudentNav from '@/components/StudentNav'
import { BarChartIcon, TrophyIcon } from '@/components/Icons'
import styles from './page.module.css'

interface Props { profile: any; school: any; userId: string }

export default function ResultsClient({ profile, school, userId }: Props) {
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [term, setTerm]       = useState<string>('all')
  const supabase    = createClient()
  const schoolColor = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('results')
      .select('id, subject, score, grade, max_score, term, session, created_at')
      .eq('student_id', userId)
      .order('created_at', { ascending: false })
    if (data) setResults(data)
    setLoading(false)
  }

  const filtered = term === 'all' ? results : results.filter(r => r.term === term)
  const avg = filtered.length
    ? Math.round(filtered.reduce((s,r) => s + (r.score / r.max_score) * 100, 0) / filtered.length)
    : 0

  function gradeColor(g: string) {
    if (!g) return 'var(--text-muted)'
    const l = g.toUpperCase()
    if (l === 'A') return '#10B981'
    if (l === 'B') return '#3B82F6'
    if (l === 'C') return '#F59E0B'
    if (l === 'D') return '#F97316'
    return '#EF4444'
  }

  return (
    <div className={styles.page}>
      <StudentNav userId={userId} profile={profile} school={school} schoolColor={schoolColor} />
      <div className={styles.content}>
        <DashboardHeader userId={userId} role="student" profile={profile} school={school}
          schoolColor={schoolColor} title="My Results" showBack />
        <main className={styles.main}>
          {/* Stats */}
          <div className={styles.grid2} style={{ marginBottom: 'var(--space-6)' }}>
            <div className={styles.statCard}>
              <p className={styles.statVal} style={{ color: schoolColor }}>{avg}%</p>
              <p className={styles.statLbl}>Average Score</p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statVal} style={{ color: '#10B981' }}>{filtered.length}</p>
              <p className={styles.statLbl}>Subjects</p>
            </div>
          </div>

          {/* Term filter */}
          <div style={{ display:'flex', gap:'var(--space-2)', marginBottom:'var(--space-4)', flexWrap:'wrap' }}>
            {['all','1st Term','2nd Term','3rd Term'].map(t => (
              <button key={t}
                onClick={() => setTerm(t)}
                style={{
                  padding:'6px 14px', borderRadius:'999px', fontSize:'0.75rem', fontWeight:700,
                  background: term===t ? schoolColor : 'var(--glass-bg)',
                  color: term===t ? '#fff' : 'var(--text-muted)',
                  border: `1px solid ${term===t ? schoolColor : 'var(--glass-border)'}`,
                  cursor:'pointer',
                }}>
                {t === 'all' ? 'All Terms' : t}
              </button>
            ))}
          </div>

          {loading
            ? <div className={styles.loading}><span/><span/><span/></div>
            : <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Subject</th>
                    <th className={styles.th}>Score</th>
                    <th className={styles.th}>Grade</th>
                    <th className={styles.th}>Term</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} className={styles.tr}>
                      <td className={styles.td}>{r.subject}</td>
                      <td className={styles.td}>{r.score}/{r.max_score}</td>
                      <td className={styles.td}>
                        <span style={{ color: gradeColor(r.grade), fontWeight:700 }}>{r.grade}</span>
                      </td>
                      <td className={styles.td}>{r.term}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
          }
          <div className={styles.spacer}/>
        </main>
      </div>
    </div>
  )
}
