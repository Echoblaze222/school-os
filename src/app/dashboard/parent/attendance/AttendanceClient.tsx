'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { CalendarIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

const STATUS_COLOR: Record<string, string> = {
  present: '#10B981',
  absent:  '#EF4444',
  late:    '#F59E0B',
}

export default function AttendanceClient({ profile, school, userId }: Props) {
  const [rows,    setRows]    = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [child,   setChild]   = useState<any>(null)
  const [summary, setSummary] = useState({ present: 0, absent: 0, late: 0 })
  const supabase = createClient()
  const sc = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [])

  async function load() {
    // Step 1: resolve child
    const { data: childData } = await supabase
      .from('profiles')
      .select('id, full_name, class_level')
      .eq('parent_id', userId)
      .single()

    if (!childData) { setLoading(false); return }
    setChild(childData)

    // Step 2: fetch attendance for that child only
    const { data } = await supabase
      .from('attendance')
      .select('id, date, status, subject, created_at')
      .eq('student_id', childData.id)
      .order('date', { ascending: false })
      .limit(60)

    if (data) {
      setRows(data)
      setSummary({
        present: data.filter(r => r.status === 'present').length,
        absent:  data.filter(r => r.status === 'absent').length,
        late:    data.filter(r => r.status === 'late').length,
      })
    }
    setLoading(false)
  }

  const total = summary.present + summary.absent + summary.late
  const rate  = total > 0 ? Math.round((summary.present / total) * 100) : 0

  return (
    <RolePageWrapper userId={userId} role="parent" profile={profile} school={school} title="Attendance">
      {loading
        ? <div className={styles.loading}><span/><span/><span/></div>
        : !child
          ? <div className={styles.empty}>
              <CalendarIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
              <p>No child linked to your account.</p>
            </div>
          : <>
              <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginBottom:'var(--space-4)' }}>
                Showing attendance for <strong style={{ color:'var(--text-primary)' }}>{child.full_name}</strong> · {child.class_level}
              </p>

              {/* Summary row */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:'var(--space-5)' }}>
                {[
                  { label: 'Rate',    value: `${rate}%`,        color: rate >= 75 ? '#10B981' : '#EF4444' },
                  { label: 'Present', value: summary.present,   color: '#10B981' },
                  { label: 'Absent',  value: summary.absent,    color: '#EF4444' },
                  { label: 'Late',    value: summary.late,      color: '#F59E0B' },
                ].map(s => (
                  <div key={s.label} className={styles.statCard}>
                    <p className={styles.statVal} style={{ color: s.color }}>{s.value}</p>
                    <p className={styles.statLbl}>{s.label}</p>
                  </div>
                ))}
              </div>

              {rows.length === 0
                ? <div className={styles.empty}>
                    <CalendarIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
                    <p>No attendance records yet.</p>
                  </div>
                : <div className={styles.list}>
                    {rows.map((item, i) => (
                      <div key={item.id ?? i} className={styles.card}>
                        <div className={styles.cardIcon} style={{ background: sc + '20' }}>
                          <CalendarIcon size={16} color={sc}/>
                        </div>
                        <div className={styles.cardBody}>
                          <p className={styles.cardTitle}>
                            {item.subject ?? 'General'} &nbsp;
                            <span style={{ fontWeight: 700, color: STATUS_COLOR[item.status] ?? 'var(--text-muted)', fontSize:'0.72rem', textTransform:'capitalize' }}>
                              {item.status}
                            </span>
                          </p>
                          <p className={styles.cardMeta}>
                            {item.date
                              ? new Date(item.date).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })
                              : item.created_at
                                ? new Date(item.created_at).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })
                                : ''}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
              }
            </>
      }
      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}