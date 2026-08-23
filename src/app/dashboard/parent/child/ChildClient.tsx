'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RoleSubHeader from '@/components/RoleSubHeader'
import { PARENT_FEATURE_GROUPS } from '@/app/dashboard/parent/featureGroups'
import KpiCard from '@/components/KpiCard'
import { UserIcon, BarChartIcon, CalendarIcon, TrophyIcon, CheckCircleIcon, XIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'
import { SkeletonList } from '@/components/motion/Skeleton'

// PARENT FIX: accept childId prop so parent can view any linked child via ?id=
interface Props { profile: any; school: any; userId: string; childId?: string | null }

export default function ChildClient({ profile, school, userId, childId }: Props) {
  const [child,      setChild]      = useState<any>(null)
  const [children,   setChildren]   = useState<any[]>([])
  const [results,    setResults]    = useState<any[]>([])
  const [attendance, setAttendance] = useState({ present:0, absent:0, late:0 })
  const [boarding,   setBoarding]   = useState<any>(null)
  const [loading,    setLoading]    = useState(true)
  const supabase    = createClient()
  const schoolColor = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [childId])

  async function load() {
    // PARENT FIX: resolve linked children via parent_student_links (source of truth),
    // not profiles.parent_id which no longer exists.
    const { data: links } = await supabase
      .from('parent_student_links')
      .select('student_id')
      .eq('parent_id', userId)

    if (!links?.length) { setLoading(false); return }
    const ids = links.map((l: any) => l.student_id as string)

    // student_profiles.class_id is what every real write flow updates
    // (creation, edit modal, promotion/transfer) - it's the CURRENT value.
    // profiles.class_id is never touched by promotion, so it goes stale
    // for any promoted student; used only as a fallback when a student has
    // no student_profiles row at all.
    const [{ data: pRows }, { data: spRows }] = await Promise.all([
      supabase.from('profiles')
        .select('id, full_name, default_code, avatar_url, email, class_id')
        .in('id', ids),
      supabase.from('student_profiles')
        .select('id, class_id')
        .in('id', ids),
    ])

    const classIds = [...new Set(ids.map((sid: string) => {
      const sp = ((spRows ?? []) as any[]).find((r: any) => r.id === sid)
      const p  = ((pRows  ?? []) as any[]).find((r: any) => r.id === sid)
      return sp?.class_id ?? p?.class_id ?? null
    }).filter(Boolean))]
    const { data: classRows } = classIds.length
      ? await supabase.from('classes').select('id, name, class_level').in('id', classIds)
      : { data: [] as any[] }

    const allChildren = ids.map((sid: string) => {
      const p  = ((pRows  ?? []) as any[]).find((r: any) => r.id === sid)
      const sp = ((spRows ?? []) as any[]).find((r: any) => r.id === sid)
      const resolvedClassId = sp?.class_id ?? p?.class_id ?? null
      const cl = (classRows ?? []).find((r: any) => r.id === resolvedClassId)
      return {
        id:           sid,
        full_name:    p?.full_name    ?? null,
        default_code: p?.default_code ?? null,
        avatar_url:   p?.avatar_url   ?? null,
        email:        p?.email        ?? null,
        class_level:  cl?.class_level ?? cl?.name ?? null,
      }
    }).filter((c: any) => !!c.full_name)

    if (!allChildren.length) { setLoading(false); return }
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

    // §21 Hostel + Parent connection: only for boarding students (no bed
    // assignment = day student, section stays hidden). Deliberately no
    // incident data here - incidents reach parents only through the
    // explicit opt-in notify_parent action in hostel/incidents/route.ts,
    // which sends a fixed safe template. This is presence/location
    // reassurance only, not a second channel into incident detail.
    const { data: bedRow } = await supabase
      .from('hostel_bed_assignments')
      .select('hostel_beds!inner(label, hostel_rooms!inner(name, hostel_blocks!inner(name, hostels!inner(id, name))))')
      .eq('student_id', target.id).eq('status', 'active').maybeSingle()

    if (bedRow) {
      const bed   = Array.isArray((bedRow as any).hostel_beds) ? (bedRow as any).hostel_beds[0] : (bedRow as any).hostel_beds
      const room  = Array.isArray(bed?.hostel_rooms) ? bed.hostel_rooms[0] : bed?.hostel_rooms
      const block = Array.isArray(room?.hostel_blocks) ? room.hostel_blocks[0] : room?.hostel_blocks
      const hostelRow = Array.isArray(block?.hostels) ? block.hostels[0] : block?.hostels

      const [{ data: todayEntry }, { data: activeLeave }] = await Promise.all([
        hostelRow?.id
          ? supabase.from('hostel_roll_call_entries')
              .select('status, recorded_at, hostel_roll_call_sessions!inner(hostel_id, session_date)')
              .eq('student_id', target.id)
              .eq('hostel_roll_call_sessions.session_date', new Date().toISOString().slice(0, 10))
              .eq('hostel_roll_call_sessions.hostel_id', hostelRow.id)
              .order('recorded_at', { ascending: false }).limit(1).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('hostel_leave_requests')
          .select('status, destination, departure_expected, return_expected')
          .eq('student_id', target.id).in('status', ['pending', 'approved'])
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ])

      setBoarding({
        hostelName: hostelRow?.name ?? null,
        blockName:  block?.name ?? null,
        roomName:   room?.name ?? null,
        bedLabel:   bed?.label ?? null,
        todayStatus: (todayEntry as any)?.status ?? null,
        leave: activeLeave ?? null,
      })
    } else {
      setBoarding(null)
    }

    setLoading(false)
  }

  const totalDays = attendance.present + attendance.absent + attendance.late
  const attRate   = totalDays > 0 ? Math.round((attendance.present / totalDays) * 100) : 0
  const avgScore  = results.length > 0
    ? Math.round(results.reduce((s, r) => s + ((r.score / (r.max_score || 100)) * 100), 0) / results.length)
    : 0

  return (
    <RoleSubHeader userId={userId} role="parent" profile={profile} school={school} title="Child's Profile" featureGroups={PARENT_FEATURE_GROUPS}>
      {loading
        ? <SkeletonList count={4} variant="card" />
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
                <KpiCard label="Avg Score" value={`${avgScore}%`} icon={<BarChartIcon size={16} />} color={avgScore>=60?'#10B981':'#EF4444'} valueColor={avgScore>=60?'#10B981':'#EF4444'} context="This term" />
                <KpiCard label="Attendance" value={`${attRate}%`} icon={<CalendarIcon size={16} />} color={attRate>=75?'#10B981':'#EF4444'} valueColor={attRate>=75?'#10B981':'#EF4444'} context="This term" />
                <KpiCard label="Days Present" value={attendance.present} icon={<CheckCircleIcon size={16} />} color="#10B981" />
                <KpiCard label="Days Absent" value={attendance.absent} icon={<XIcon size={16} />} color="#EF4444" />
              </div>

              {/* Boarding / hostel status - §21, boarding students only */}
              {boarding && (
                <>
                  <p className={styles.sectionLabel}>Boarding Status</p>
                  <div style={{ padding:'var(--space-4)', background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:'var(--radius-xl)', marginBottom:'var(--space-6)' }}>
                    <p style={{ fontSize:'0.85rem', fontWeight:700, color:'var(--text-primary)', margin:'0 0 4px' }}>
                      {boarding.hostelName}{boarding.blockName ? ` · ${boarding.blockName}` : ''}{boarding.roomName ? ` · ${boarding.roomName}` : ''}{boarding.bedLabel ? ` · ${boarding.bedLabel}` : ''}
                    </p>
                    <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', margin:0 }}>
                      {boarding.todayStatus
                        ? `Today's roll call: ${boarding.todayStatus}`
                        : 'No roll call recorded yet today'}
                    </p>
                    {boarding.leave && (
                      <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', margin:'4px 0 0' }}>
                        Leave {boarding.leave.status}{boarding.leave.destination ? ` · ${boarding.leave.destination}` : ''}
                      </p>
                    )}
                  </div>
                </>
              )}

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
    </RoleSubHeader>
  )
}
