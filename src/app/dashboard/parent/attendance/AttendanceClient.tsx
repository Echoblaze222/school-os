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
  const [rows,     setRows]     = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [children, setChildren] = useState<any[]>([])
  const [child,    setChild]    = useState<any>(null)
  const [summary,  setSummary]  = useState({ present: 0, absent: 0, late: 0 })
  const supabase = createClient()
  const sc = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)

    // Resolve children via parent_student_links first, fallback to profiles.parent_id
    const { data: links } = await supabase
      .from('parent_student_links')
      .select('student_id')
      .eq('parent_id', userId)

    let resolvedChildren: any[] = []

    if (links?.length) {
      const ids = links.map(l => l.student_id)
      const { data: childProfiles } = await supabase
        .from('profiles')
        .select('id, full_name, class_level, school_id, class_id')
        .in('id', ids)
      resolvedChildren = childProfiles ?? []
    } else {
      // Legacy fallback: profiles.parent_id
      const { data: fallback } = await supabase
        .from('profiles')
        .select('id, full_name, class_level, school_id, class_id')
        .eq('parent_id', userId)
      resolvedChildren = fallback ?? []
    }

    if (!resolvedChildren.length) { setLoading(false); return }

    setChildren(resolvedChildren)
    setChild(resolvedChildren[0])

    // Load attendance for the first child before releasing loading state
    await loadAttendance(resolvedChildren[0].id)
    setLoading(false)
  }

  async function loadAttendance(childId: string) {
    const { data } = await supabase
      .from('attendance')
      .select('id, date, status, is_present, notes')
      .eq('student_id', childId)
      .order('date', { ascending: false })
      .limit(60)

    if (data) {
      const normalised = data.map(r => ({
        ...r,
        status: r.status ?? (r.is_present ? 'present' : 'absent'),
      }))
      setRows(normalised)
      setSummary({
        present: normalised.filter(r => r.status === 'present').length,
        absent:  normalised.filter(r => r.status === 'absent').length,
        late:    normalised.filter(r => r.status === 'late').length,
      })
    } else {
      setRows([])
      setSummary({ present: 0, absent: 0, late: 0 })
    }
  }

  // When parent switches child tab, reload attendance for that child
  async function switchChild(c: any) {
    setChild(c)
    setRows([])
    setSummary({ present: 0, absent: 0, late: 0 })
    await loadAttendance(c.id)
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
              {/* Child switcher — shown when parent has multiple children */}
              {children.length > 1 && (
                <div style={{ display:'flex', gap:6, overflowX:'auto', marginBottom:'var(--space-3)', paddingBottom:2 }}>
                  {children.map(c => (
                    <button key={c.id} onClick={() => switchChild(c)}
                      style={{ flexShrink:0, padding:'5px 12px', borderRadius:999, border:'1px solid ' + (child?.id === c.id ? sc : sc + '40'), background: child?.id === c.id ? sc : 'transparent', color: child?.id === c.id ? '#fff' : sc, fontSize:'0.75rem', fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
                      {c.full_name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              )}
              <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginBottom:'var(--space-4)' }}>
                Showing attendance for <strong style={{ color:'var(--text-primary)' }}>{child.full_name}</strong> · {child.class_level ?? '—'}
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
                            {item.notes ? item.notes : 'Attendance'} &nbsp;
                            <span style={{ fontWeight: 700, color: STATUS_COLOR[item.status] ?? 'var(--text-muted)', fontSize:'0.72rem', textTransform:'capitalize' }}>
                              {item.status}
                            </span>
                          </p>
                          <p className={styles.cardMeta}>
                            {item.date
                              ? new Date(item.date + 'T00:00:00').toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })
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
