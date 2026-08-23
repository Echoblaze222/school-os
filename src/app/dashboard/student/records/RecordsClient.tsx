'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import StudentNav from '@/components/StudentNav'
import KpiCard from '@/components/KpiCard'
import { FileTextIcon, CalendarIcon, PercentIcon, CheckCircleIcon, XIcon, ClockIcon } from '@/components/Icons'
import styles from './page.module.css'
import motion from '@/components/dashboard-motion.module.css'

interface Props { profile: any; school: any; userId: string }

export default function RecordsClient({ profile, school, userId }: Props) {
  const [attendance, setAttendance] = useState<any[]>([])
  const [behaviour,  setBehaviour]  = useState<any[]>([])
  const [loading,    setLoading]    = useState(true)
  const [tab,        setTab]        = useState<'summary'|'attendance'|'behaviour'>('summary')
  const supabase    = createClient()
  const schoolColor = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [])

  async function load() {
    // Attendance - always available
    const { data: att } = await supabase
      .from('attendance')
      .select('id, date, status, note')
      .eq('student_id', userId)
      .order('date', { ascending: false })
      .limit(60)
    if (att) setAttendance(att)

    // Behaviour records - only query if table exists, fail silently
    try {
      const { data: beh } = await supabase
        .from('behaviour_records')
        .select('id, type, description, created_at, recorded_by:profiles(full_name)')
        .eq('student_id', userId)
        .order('created_at', { ascending: false })
        .limit(20)
      if (beh) setBehaviour(beh)
    } catch (_) {
      // table doesn't exist yet - show empty state
    }

    setLoading(false)
  }

  const present = attendance.filter(a => a.status === 'present').length
  const absent  = attendance.filter(a => a.status === 'absent').length
  const late    = attendance.filter(a => a.status === 'late').length
  const total   = attendance.length
  const rate    = total > 0 ? Math.round((present / total) * 100) : 0

  function sColor(s: string) {
    return s === 'present' ? '#10B981' : s === 'absent' ? '#EF4444' : '#F59E0B'
  }
  function bColor(t: string) {
    return t === 'positive' ? '#10B981' : t === 'negative' ? '#EF4444' : '#6B7280'
  }

  return (
    <div className={styles.page}>
      <StudentNav userId={userId} profile={profile} school={school} schoolColor={schoolColor} />
      <div className={styles.content}>
        <DashboardHeader userId={userId} role="student" profile={profile} school={school}
          schoolColor={schoolColor} title="My Records" showBack />
        <main className={styles.main}>
          <div className={styles.tabs}>
            {(['summary','attendance','behaviour'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`${styles.tab} ${tab===t ? styles.tabActive : ''}`}
                style={tab===t ? { background:schoolColor, color:'#fff', borderColor:schoolColor } : {}}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {loading ? <div className={styles.loading}><span/><span/><span/></div> : <>

            {tab === 'summary' && (
              <>
                <div className={styles.statsRow} style={{ marginBottom:'var(--space-5)' }}>
                  <KpiCard label="Attendance Rate" value={`${rate}%`} icon={<PercentIcon size={16} />} color="#10B981" valueColor="#10B981" />
                  <KpiCard label="Present" value={present} icon={<CheckCircleIcon size={16} />} color="#10B981" valueColor="#10B981" />
                  <KpiCard label="Absent" value={absent} icon={<XIcon size={16} />} color="#EF4444" valueColor="#EF4444" />
                  <KpiCard label="Late" value={late} icon={<ClockIcon size={16} />} color="#F59E0B" valueColor="#F59E0B" />
                </div>
                <div className={styles.progressCard}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                    <span style={{ fontSize:'0.78rem', fontWeight:700, color:'var(--text-primary)' }}>Attendance Progress</span>
                    <span style={{ fontSize:'0.78rem', fontWeight:800, color:schoolColor }}>{rate}%</span>
                  </div>
                  <div className={styles.progressTrack}>
                    <div className={styles.progressFill} style={{ width:`${rate}%`, background: rate >= 75 ? '#10B981' : rate >= 50 ? '#F59E0B' : '#EF4444' }}/>
                  </div>
                  <p style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:6 }}>{total} days recorded</p>
                </div>
              </>
            )}

            {tab === 'attendance' && (
              attendance.length === 0
                ? <div className={styles.empty}><CalendarIcon size={40} color="var(--text-faint)" strokeWidth={1}/><p>No attendance records yet</p></div>
                : <div className={styles.list}>
                  {attendance.map((a, i) => (
                    <div key={a.id} className={`${styles.card} ${motion.staggerItem}`} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                      <div className={styles.cardIcon} style={{ background: sColor(a.status)+'20' }}>
                        <CalendarIcon size={16} color={sColor(a.status)}/>
                      </div>
                      <div className={styles.cardBody}>
                        <p className={styles.cardTitle}>{new Date(a.date).toLocaleDateString('en-NG',{weekday:'long',day:'numeric',month:'long'})}</p>
                        {a.note && <p className={styles.cardText}>{a.note}</p>}
                      </div>
                      <span style={{ padding:'3px 10px', borderRadius:999, fontSize:'0.68rem', fontWeight:700, flexShrink:0, background:sColor(a.status)+'20', color:sColor(a.status) }}>
                        {a.status}
                      </span>
                    </div>
                  ))}
                </div>
            )}

            {tab === 'behaviour' && (
              behaviour.length === 0
                ? <div className={styles.empty}><FileTextIcon size={40} color="var(--text-faint)" strokeWidth={1}/><p>No behaviour records yet</p></div>
                : <div className={styles.list}>
                  {behaviour.map((b, i) => (
                    <div key={b.id} className={`${styles.card} ${motion.staggerItem}`} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                      <div className={styles.cardIcon} style={{ background: bColor(b.type)+'20' }}>
                        <FileTextIcon size={16} color={bColor(b.type)}/>
                      </div>
                      <div className={styles.cardBody}>
                        <p className={styles.cardTitle}>{b.description}</p>
                        <p className={styles.cardMeta}>{(b.recorded_by as any)?.full_name ?? 'Teacher'} · {new Date(b.created_at).toLocaleDateString('en-NG',{day:'numeric',month:'short'})}</p>
                      </div>
                      <span style={{ padding:'3px 10px', borderRadius:999, fontSize:'0.68rem', fontWeight:700, flexShrink:0, background:bColor(b.type)+'20', color:bColor(b.type) }}>
                        {b.type}
                      </span>
                    </div>
                  ))}
                </div>
            )}
          </>}
          <div className={styles.spacer}/>
        </main>
      </div>
    </div>
  )
}
