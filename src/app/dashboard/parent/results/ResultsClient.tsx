'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { BarChartIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

export default function ResultsClient({ profile, school, userId }: Props) {
  const [rows,    setRows]    = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [child,   setChild]   = useState<any>(null)
  const supabase = createClient()
  const sc = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [])

  async function load() {
    // Step 1: resolve child linked to this parent
    const { data: childData } = await supabase
      .from('profiles')
      .select('id, full_name, class_level')
      .eq('parent_id', userId)
      .single()

    if (!childData) { setLoading(false); return }
    setChild(childData)

    // Step 2: fetch results for that child only
    const { data } = await supabase
      .from('results')
      .select('id, subject, score, max_score, grade, term, created_at')
      .eq('student_id', childData.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (data) setRows(data)
    setLoading(false)
  }

  return (
    <RolePageWrapper userId={userId} role="parent" profile={profile} school={school} title="Child Results">
      {loading
        ? <div className={styles.loading}><span/><span/><span/></div>
        : !child
          ? <div className={styles.empty}>
              <BarChartIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
              <p>No child linked to your account.</p>
            </div>
          : rows.length === 0
            ? <div className={styles.empty}>
                <BarChartIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
                <p>No results found for {child.full_name} yet.</p>
              </div>
            : <>
                <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginBottom:'var(--space-4)' }}>
                  Showing results for <strong style={{ color:'var(--text-primary)' }}>{child.full_name}</strong> · {child.class_level}
                </p>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>Subject</th>
                      <th className={styles.th}>Score</th>
                      <th className={styles.th}>Grade</th>
                      <th className={styles.th}>Term</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const gColor = r.grade==='A'?'#10B981':r.grade==='B'?'#3B82F6':r.grade==='C'?'#F59E0B':r.grade==='D'?'#F97316':'#EF4444'
                      return (
                        <tr key={r.id ?? i}>
                          <td className={styles.td}>{r.subject}</td>
                          <td className={styles.td}>{r.score}/{r.max_score ?? 100}</td>
                          <td className={styles.td}>
                            <span style={{ fontWeight: 700, color: gColor }}>{r.grade}</span>
                          </td>
                          <td className={styles.td}>{r.term}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </>
      }
      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}