'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { UserIcon, BarChartIcon, CalendarIcon, TrophyIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

// PARENT FIX: accept childId prop so parent can view any linked child via ?id=
interface Props { profile: any; school: any; userId: string; childId?: string | null }

export default function ChildClient({ profile, school, userId, childId }: Props) {
  const [child,      setChild]      = useState<any>(null)
  const [children,   setChildren]   = useState<any[]>([])
  const [results,    setResults]    = useState<any[]>([])
  const [attendance, setAttendance] = useState({ present:0, absent:0, late:0 })
  const [loading,    setLoading]    = useState(true)
  const supabase    = createClient()
  const schoolColor = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [childId])

  async function load() {
    // PARENT FIX: fetch ALL children first so we can show a switcher
    const { data: allChildren } = await supabase
      .from('profiles')
      .select('id, full_name, default_code, class_level, avatar_url, email')
      .eq('parent_id', userId)

    if (!allChildren?.length) { setLoading(false); return }
    setChildren(allChildren)

    // PARENT FIX: use the ?id= param to pick which child, fall back to first
    const target = childId
      ? allChildren.find(c => c.id === childId) ?? allChildren[0]
      : allChildren[0]
    setChild(target)

    const [{ data: res }, { data: att }] = await Promise.all([
      supabase.from('results')
        .select('subject, score, max_score, grade, term')
        .eq('student_id', target.id)
        .order('created_at', { ascending:false }).limit(10),
      supabase.from('attendance')
        .select('status')
        .eq('student_id', target.id),
    ])

    if (res) setResults(res)
    if (att) {
      setAttendance({
        present: att.filter(a => a.status==='present').length,
        absent:  att.filter(a => a.status==='absent').length,
        late:    att.filter(a => a.status==='late').length,
      })
    }
    setLoading(false)
  }

  const totalDays = attendance.present + attendance.absent + attendance.late
  const attRate   = totalDays > 0 ? Math.round((attendance.present / totalDays) * 100) : 0
  const avgScore  = results.length > 0
    ? Math.round(results.reduce((s, r) => s + ((r.score / (r.max_score || 100)) * 100), 0) / results.length)
    : 0

  return (
    <RolePageWrapper userId={userId} role="parent" profile={profile} school={school} title="Child's Profile">
      {loading
        ? <div className={styles.loading}><span/><span/><span/></div>
        : !child
          ? <div className={styles.empty}><UserIcon size={40} color="var(--text-faint)" strokeWidth={1}/><p>No child linked to your account. Contact the school admin.</p></div>
          : <>
              {/* PARENT FIX: child switcher if more than one child linked */}
              {children.length > 1 && (
                <div style={{ display:'flex', gap:8, marginBottom:16, overflowX:'auto', paddingBottom:4 }}>
                  {children.map(c => (
                    <a
                      key={c.id}
                      href={`/dashboard/parent/child?id=${c.id}`}
                      style={{
                        padding:'5px 14px', borderRadius:999, fontSize:'0.73rem', fontWeight:700,
                        textDecoration:'none',
                        background: c.id === child.id ? schoolColor : 'var(--glass-bg)',
                        color:      c.id === child.id ? '#fff' : 'var(--text-muted)',
                        border:`1px solid ${c.id === child.id ? schoolColor : 'var(--glass-border)'}`,
                        flexShrink:0,
                      }}>
                      {c.full_name?.split(' ')[0]}
                    </a>
                  ))}
                </div>
              )}

              {/* Child card */}
              <div style={{ display:'flex', alignItems:'center', gap:'var(--space-4)', padding:'var(--space-5)', background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:'var(--radius-xl)', marginBottom:'var(--space-5)' }}>
                <div style={{ width:60, height:60, borderRadius:'50%', background:schoolColor, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', flexShrink:0 }}>
                  {child.avatar_url
                    ? <img src={child.avatar_url} alt={child.full_name} style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                    : <UserIcon size={24} color="white"/>
                  }
                </div>
                <div>
                  <p style={{ fontSize:'1rem', fontWeight:800, color:'var(--text-primary)', margin:'0 0 3px' }}>{child.full_name}</p>
                  <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', margin:0 }}>
                    {child.class_level} · {child.default_code} · {school?.name}
                  </p>
                </div>
              </div>

              {/* Stats */}
              <div className={styles.statsRow} style={{ marginBottom:'var(--space-6)' }}>
                {[
                  { label:'Avg Score',    value:`${avgScore}%`,        color:avgScore>=60?'#10B981':'#EF4444' },
                  { label:'Attendance',   value:`${attRate}%`,         color:attRate>=75?'#10B981':'#EF4444' },
                  { label:'Days Present', value:attendance.present,    color:'#10B981' },
                  { label:'Days Absent',  value:attendance.absent,     color:'#EF4444' },
                ].map(s => (
                  <div key={s.label} className={styles.statCard}>
                    <p className={styles.statVal} style={{ color:s.color }}>{s.value}</p>
                    <p className={styles.statLbl}>{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Latest results */}
              <p className={styles.sectionLabel}>Latest Results</p>
              {results.length === 0
                ? <div className={styles.empty}><BarChartIcon size={32} color="var(--text-faint)" strokeWidth={1}/><p>No results yet</p></div>
                : <table className={styles.table}>
                    <thead><tr>
                      <th className={styles.th}>Subject</th>
                      <th className={styles.th}>Score</th>
                      <th className={styles.th}>Grade</th>
                      <th className={styles.th}>Term</th>
                    </tr></thead>
                    <tbody>
                      {results.map((r, i) => {
                        const gColor = r.grade==='A'?'#10B981':r.grade==='B'?'#3B82F6':r.grade==='C'?'#F59E0B':r.grade==='D'?'#F97316':'#EF4444'
                        return (
                          <tr key={i}>
                            <td className={styles.td}>{r.subject}</td>
                            <td className={styles.td}>{r.score}/{r.max_score||100}</td>
                            <td className={styles.td}><span style={{ fontWeight:700, color:gColor }}>{r.grade}</span></td>
                            <td className={styles.td}>{r.term}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
              }
              <div className={styles.spacer}/>
            </>
      }
    </RolePageWrapper>
  )
}
