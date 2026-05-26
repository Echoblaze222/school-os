'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { SchoolIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

const FILTERS = [
  { label:'Last 30 days', days:30  },
  { label:'Last 90 days', days:90  },
  { label:'This year',    days:365 },
]

export default function AdmissionsClient({ profile, school, userId }: Props) {
  const [students, setStudents] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState(0)
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [filter])

  async function load() {
    setLoading(true)
    const since = new Date()
    since.setDate(since.getDate() - FILTERS[filter].days)
    const { data } = await supabase.from('profiles')
      .select('id, full_name, default_code, class_level, avatar_url, created_at')
      .eq('school_id', school?.id).eq('role', 'student')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending:false })
    if (data) setStudents(data)
    setLoading(false)
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })
  }

  function isNew(iso: string) {
    return (Date.now() - new Date(iso).getTime()) < 7 * 24 * 60 * 60 * 1000
  }

  return (
    <RolePageWrapper userId={userId} role="secretary" profile={profile} school={school} title="Admissions">
      <div className={styles.tabs} style={{ marginBottom:'var(--space-5)' }}>
        {FILTERS.map((f, i) => (
          <button key={f.label} onClick={() => setFilter(i)}
            className={`${styles.tab} ${filter===i ? styles.tabActive : ''}`}
            style={filter===i ? { background:sc, color:'#fff', borderColor:sc } : {}}>
            {f.label}
          </button>
        ))}
      </div>

      <p style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-muted)',
        marginBottom:'var(--space-3)', letterSpacing:'0.05em' }}>
        {students.length} NEW ENROLMENT{students.length !== 1 ? 'S' : ''}
      </p>

      {loading
        ? <div className={styles.loading}><span/><span/><span/></div>
        : students.length === 0
          ? <div className={styles.empty}><SchoolIcon size={40} color="var(--text-faint)" strokeWidth={1}/><p>No new admissions in this period</p></div>
          : <div className={styles.list}>
              {students.map((s:any) => (
                <div key={s.id} className={styles.card}>
                  <div className={styles.cardIcon}
                    style={{ background:sc+'20', borderRadius:'50%', overflow:'hidden' }}>
                    {s.avatar_url
                      ? <img src={s.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                      : <span style={{ fontWeight:800, color:sc }}>{s.full_name?.[0]}</span>}
                  </div>
                  <div className={styles.cardBody}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <p className={styles.cardTitle} style={{ margin:0 }}>{s.full_name}</p>
                      {isNew(s.created_at) && (
                        <span style={{ fontSize:'0.6rem', fontWeight:800, background:'#10B98120',
                          color:'#10B981', padding:'2px 6px', borderRadius:999 }}>NEW</span>
                      )}
                    </div>
                    <p className={styles.cardMeta}>{s.default_code}{s.class_level ? ` · ${s.class_level}` : ''}</p>
                  </div>
                  <p style={{ fontSize:'0.7rem', color:'var(--text-muted)', flexShrink:0, textAlign:'right' }}>
                    {fmtDate(s.created_at)}
                  </p>
                </div>
              ))}
            </div>
      }
      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}
