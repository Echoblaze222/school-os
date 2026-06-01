'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { FileTextIcon, BarChartIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

export default function RecordsClient({ profile, school, userId }: Props) {
  const [students,   setStudents]   = useState<any[]>([])
  const [selected,   setSelected]   = useState<any>(null)
  const [results,    setResults]    = useState<any[]>([])
  const [attendance, setAttendance] = useState({ present:0, absent:0, late:0, total:0 })
  const [loading,    setLoading]    = useState(true)
  const [detLoading, setDetLoading] = useState(false)
  const [search,     setSearch]     = useState('')
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  useEffect(() => { loadStudents() }, [])

  async function loadStudents() {
    const { data } = await supabase.from('profiles')
      .select('id, full_name, default_code, class_level, avatar_url')
      .eq('school_id', school?.id).eq('role', 'student').order('full_name').limit(200)
    if (data) setStudents(data)
    setLoading(false)
  }

  async function openRecord(s: any) {
    setSelected(s); setDetLoading(true)
    const [{ data: res }, { data: att }] = await Promise.all([
      supabase.from('results').select('subject, score, max_score, grade, term')
        .eq('student_id', s.id).order('created_at', { ascending:false }).limit(20),
      supabase.from('attendance').select('status').eq('student_id', s.id),
    ])
    setResults(res ?? [])
    const present = (att ?? []).filter((a:any) => a.status==='present').length
    const absent  = (att ?? []).filter((a:any) => a.status==='absent').length
    const late    = (att ?? []).filter((a:any) => a.status==='late').length
    setAttendance({ present, absent, late, total: present+absent+late })
    setDetLoading(false)
  }

  const filtered = students.filter(s =>
    !search ||
    s.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.default_code?.toLowerCase().includes(search.toLowerCase())
  )

  const attRate  = attendance.total > 0 ? Math.round((attendance.present/attendance.total)*100) : 0
  const avgScore = results.length > 0
    ? Math.round(results.reduce((sum,r) => sum + ((r.score/(r.max_score||100))*100), 0) / results.length)
    : 0

  function gradeColor(g:string) {
    return g==='A'?'#10B981':g==='B'?'#3B82F6':g==='C'?'#F59E0B':g==='D'?'#F97316':'#EF4444'
  }

  if (selected) return (
    <RolePageWrapper userId={userId} role="secretary" profile={profile} school={school} title="Student Record">
      <button onClick={() => setSelected(null)}
        style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)',
          fontSize:'0.8rem', fontWeight:700, marginBottom:'var(--space-5)', padding:0 }}>
        ← Back to records
      </button>

      <div style={{ display:'flex', alignItems:'center', gap:'var(--space-4)', padding:'var(--space-5)',
        background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:'var(--radius-xl)',
        marginBottom:'var(--space-5)' }}>
        <div style={{ width:54, height:54, borderRadius:'50%', background:sc+'20', display:'flex',
          alignItems:'center', justifyContent:'center', overflow:'hidden', flexShrink:0 }}>
          {selected.avatar_url
            ? <img src={selected.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
            : <span style={{ fontWeight:800, fontSize:'1.2rem', color:sc }}>{selected.full_name?.[0]}</span>}
        </div>
        <div>
          <p style={{ fontSize:'1rem', fontWeight:800, color:'var(--text-primary)', margin:'0 0 2px' }}>{selected.full_name}</p>
          <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', margin:0 }}>{selected.class_level} · {selected.default_code}</p>
        </div>
      </div>

      {detLoading
        ? <div className={styles.loading}><span/><span/><span/></div>
        : <>
            <div className={styles.statsRow} style={{ marginBottom:'var(--space-5)' }}>
              {[
                { label:'Avg Score',  value:`${avgScore}%`,       color: avgScore>=60?'#10B981':'#EF4444' },
                { label:'Attendance', value:`${attRate}%`,        color: attRate>=75?'#10B981':'#EF4444'  },
                { label:'Present',    value: attendance.present,  color:'#10B981' },
                { label:'Absent',     value: attendance.absent,   color:'#EF4444' },
              ].map(s => (
                <div key={s.label} className={styles.statCard}>
                  <p className={styles.statVal} style={{ color:s.color }}>{s.value}</p>
                  <p className={styles.statLbl}>{s.label}</p>
                </div>
              ))}
            </div>

            {results.length === 0
              ? <div className={styles.empty}><BarChartIcon size={32} color="var(--text-faint)" strokeWidth={1}/><p>No results on record</p></div>
              : <table className={styles.table}>
                  <thead><tr>
                    <th className={styles.th}>Subject</th>
                    <th className={styles.th}>Score</th>
                    <th className={styles.th}>Grade</th>
                    <th className={styles.th}>Term</th>
                  </tr></thead>
                  <tbody>{results.map((r:any, i:number) => (
                    <tr key={i}>
                      <td className={styles.td}>{r.subject}</td>
                      <td className={styles.td}>{r.score}/{r.max_score ?? 100}</td>
                      <td className={styles.td}><span style={{ fontWeight:800, color:gradeColor(r.grade) }}>{r.grade}</span></td>
                      <td className={styles.td}>{r.term}</td>
                    </tr>
                  ))}</tbody>
                </table>
            }
          </>
      }
      <div className={styles.spacer}/>
    </RolePageWrapper>
  )

  return (
    <RolePageWrapper userId={userId} role="secretary" profile={profile} school={school} title="Records">
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search student by name or ID…"
        style={{ width:'100%', height:42, padding:'0 14px', background:'var(--input-bg)',
          border:'1px solid var(--input-border)', borderRadius:10, color:'var(--text-primary)',
          fontSize:'0.85rem', outline:'none', marginBottom:'var(--space-4)' }}/>

      {loading
        ? <div className={styles.loading}><span/><span/><span/></div>
        : filtered.length === 0
          ? <div className={styles.empty}><FileTextIcon size={40} color="var(--text-faint)" strokeWidth={1}/><p>No records found</p></div>
          : <div className={styles.list}>
              {filtered.map((s:any) => (
                <div key={s.id} className={styles.card} onClick={() => openRecord(s)} style={{ cursor:'pointer' }}>
                  <div className={styles.cardIcon} style={{ background:sc+'20', borderRadius:'50%', overflow:'hidden' }}>
                    {s.avatar_url
                      ? <img src={s.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                      : <span style={{ fontWeight:800, color:sc }}>{s.full_name?.[0]}</span>}
                  </div>
                  <div className={styles.cardBody}>
                    <p className={styles.cardTitle}>{s.full_name}</p>
                    <p className={styles.cardMeta}>{s.default_code} · {s.class_level}</p>
                  </div>
                  <span style={{ fontSize:'0.7rem', color:sc, fontWeight:700, flexShrink:0 }}>View →</span>
                </div>
              ))}
            </div>
      }
      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}
