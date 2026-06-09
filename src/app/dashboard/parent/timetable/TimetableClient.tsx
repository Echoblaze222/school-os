'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { ClockIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

export default function TimetableClient({ profile, school, userId }: Props) {
  const [rows,    setRows]    = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [child,   setChild]   = useState<any>(null)
  const [activeDay, setActiveDay] = useState<string>(() => {
    const d = new Date().getDay()
    return DAYS[d - 1] ?? 'Monday'
  })
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

    // Step 2: fetch timetable for child's class level
    const { data } = await supabase
      .from('timetable')
      .select('id, day, subject, start_time, end_time, teacher_name, class_level')
      .eq('school_id', school?.id)
      .eq('class_level', childData.class_level)
      .order('day',        { ascending: true })
      .order('start_time', { ascending: true })

    if (data) setRows(data)
    setLoading(false)
  }

  const dayRows = rows.filter(r => r.day === activeDay)

  return (
    <RolePageWrapper userId={userId} role="parent" profile={profile} school={school} title="Timetable">
      {loading
        ? <div className={styles.loading}><span/><span/><span/></div>
        : !child
          ? <div className={styles.empty}>
              <ClockIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
              <p>No child linked to your account.</p>
            </div>
          : <>
              <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginBottom:'var(--space-4)' }}>
                Timetable for <strong style={{ color:'var(--text-primary)' }}>{child.full_name}</strong> · {child.class_level}
              </p>

              {/* Day tabs */}
              <div style={{ display:'flex', gap:6, overflowX:'auto', marginBottom:'var(--space-5)', paddingBottom:4 }}>
                {DAYS.map(day => (
                  <button
                    key={day}
                    onClick={() => setActiveDay(day)}
                    style={{
                      flexShrink: 0,
                      padding: '6px 14px',
                      borderRadius: 20,
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      background: activeDay === day ? sc : 'var(--glass-bg)',
                      color:      activeDay === day ? '#fff' : 'var(--text-secondary)',
                      transition: 'all 0.18s',
                    }}
                  >
                    {day.slice(0, 3)}
                  </button>
                ))}
              </div>

              {rows.length === 0
                ? <div className={styles.empty}>
                    <ClockIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
                    <p>No timetable set for {child.class_level} yet.</p>
                  </div>
                : dayRows.length === 0
                  ? <div className={styles.empty}>
                      <ClockIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
                      <p>No classes on {activeDay}.</p>
                    </div>
                  : <div className={styles.list}>
                      {dayRows.map((item, i) => (
                        <div key={item.id ?? i} className={styles.card}>
                          {/* Time badge */}
                          <div style={{
                            flexShrink: 0,
                            minWidth: 56,
                            textAlign: 'center',
                            background: sc + '15',
                            borderRadius: 10,
                            padding: '6px 4px',
                          }}>
                            <p style={{ fontSize:'0.65rem', fontWeight:700, color: sc, lineHeight:1.3 }}>
                              {item.start_time ? item.start_time.slice(0,5) : '--'}
                            </p>
                            <p style={{ fontSize:'0.6rem', color:'var(--text-muted)' }}>
                              {item.end_time ? item.end_time.slice(0,5) : ''}
                            </p>
                          </div>

                          <div className={styles.cardBody}>
                            <p className={styles.cardTitle}>{item.subject}</p>
                            {item.teacher_name && (
                              <p className={styles.cardMeta}>{item.teacher_name}</p>
                            )}
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