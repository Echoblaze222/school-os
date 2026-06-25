'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import RoleNav from '@/components/RoleNav'
import ChatWidget from '@/components/ChatWidget'
import LinkChildPrompt from '@/components/LinkChildPrompt'
import TrialBanner from '@/components/TrialBanner'
import { UserIcon, BarChartIcon, WalletIcon, MessageIcon, CalendarIcon, ClipboardIcon, ClockIcon, TrophyIcon } from '@/components/Icons'
import styles from './parent.module.css'

const MODULES = [
  { id:'child',       label:"Child's Profile", Icon:UserIcon,     href:'/dashboard/parent/child',       accent:'#3B82F6', bg:'#1e3a5f' },
  { id:'results',     label:'Results',          Icon:BarChartIcon, href:'/dashboard/parent/results',     accent:'#10B981', bg:'#1a4a3a' },
  { id:'fees',        label:'Fee Status',       Icon:WalletIcon,   href:'/dashboard/parent/fees',        accent:'#F59E0B', bg:'#4a3510' },
  { id:'attendance',  label:'Attendance',       Icon:CalendarIcon, href:'/dashboard/parent/attendance',  accent:'#8B5CF6', bg:'#2e1f5e' },
  { id:'assignments', label:'Assignments',      Icon:ClipboardIcon,href:'/dashboard/parent/assignments', accent:'#EC4899', bg:'#5a1a40' },
  { id:'timetable',   label:'Timetable',        Icon:ClockIcon,    href:'/dashboard/parent/timetable',   accent:'#06B6D4', bg:'#0a3040' },
  { id:'leaderboard', label:'Leaderboard',      Icon:TrophyIcon,   href:'/dashboard/parent/leaderboard', accent:'#F97316', bg:'#4a2810' },
  { id:'meetings',    label:'Meetings',         Icon:CalendarIcon, href:'/dashboard/parent/meetings',    accent:'#06B6D4', bg:'#0a3040' },
  { id:'chat',        label:'Message School',   Icon:MessageIcon,  href:'/dashboard/parent/chat',        accent:'#7C3AED', bg:'#2d1060' },
]

interface ChildStats { attendance: number | null; gpa: number | null; rank: number | null; pendingTasks: number }
interface Props { profile: any; school: any; userId: string; counts?: any }

export default function ParentDashboardClient({ profile, school, userId, counts = {} }: Props) {
  const pathname = usePathname()
  // BUG 12 FIX: support multiple children — state is an array, not a single object
  const [children,      setChildren]      = useState<any[]>([])
  const [checking,      setChecking]      = useState(true)
  const [showLinkForm,  setShowLinkForm]  = useState(false)
  const [activeChildId, setActiveChildId] = useState<string | null>(null)
  const [childStats,    setChildStats]    = useState<ChildStats>({ attendance: null, gpa: null, rank: null, pendingTasks: 0 })
  const [statsLoading,  setStatsLoading]  = useState(false)
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  useEffect(() => {
    // BUG 12 FIX: removed .single() — fetch ALL linked children
    supabase.from('profiles')
      .select('id,full_name,class_level,avatar_url,default_code,school_id')
      .eq('parent_id', userId)
      .then(({ data }) => {
        setChildren(data ?? [])
        if (data?.length) setActiveChildId(data[0].id)
        setChecking(false)
      })
  }, [userId])

  useEffect(() => {
    if (!activeChildId) return
    loadChildStats(activeChildId)
  }, [activeChildId])

  async function loadChildStats(childId: string) {
    setStatsLoading(true)
    const child = children.find(c => c.id === childId)
    if (!child) { setStatsLoading(false); return }

    const now = new Date()
    const month = now.getMonth() + 1
    const currentTerm = month >= 9 ? 'first' : month >= 5 ? 'third' : 'second'
    const currentYear = month >= 9
      ? `${now.getFullYear()}/${now.getFullYear() + 1}`
      : `${now.getFullYear() - 1}/${now.getFullYear()}`

    const [
      { data: attendanceRows },
      { data: resultRows },
      { data: leaderboardRows },
      { count: tasksCount },
    ] = await Promise.all([
      supabase.from('attendance')
        .select('status, is_present')
        .eq('student_id', childId)
        .eq('school_id', child.school_id),
      supabase.from('results')
        .select('score, max_score')
        .eq('student_id', childId)
        .eq('school_id', child.school_id)
        .eq('term', currentTerm)
        .eq('academic_year', currentYear)
        .eq('approved', true),
      supabase.from('student_leaderboard')
        .select('student_id, total_points')
        .eq('class_id', child.class_id)
        .eq('term', currentTerm)
        .eq('academic_year', currentYear)
        .order('total_points', { ascending: false }),
      supabase.from('assignments')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', child.school_id)
        .eq('class_id', child.class_id)
        .eq('status', 'active'),
    ])

    const totalDays   = attendanceRows?.length ?? 0
    const presentDays = attendanceRows?.filter(r => r.status === 'present' || (!r.status && r.is_present)).length ?? 0
    const attendance  = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : null

    const valid = resultRows?.filter(r => r.score != null && r.max_score > 0) ?? []
    const gpa   = valid.length > 0
      ? Math.round(((valid.reduce((s, r) => s + (r.score! / r.max_score), 0) / valid.length) * 5) * 10) / 10
      : null

    const rankPos = leaderboardRows?.findIndex(r => r.student_id === childId)
    const rank    = (rankPos != null && rankPos >= 0) ? rankPos + 1 : null

    setChildStats({ attendance, gpa, rank, pendingTasks: tasksCount ?? 0 })
    setStatsLoading(false)
  }

  function isActive(href: string) { return pathname.startsWith(href) }

  if (checking) return (
    <div style={{ minHeight:'100dvh', background:'var(--bg-base)', display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}>
      {[0,1,2].map(i=><div key={i} style={{ width:8,height:8,borderRadius:'50%',background:'var(--brand)',animation:'b 1.2s ease infinite',animationDelay:`${i*0.2}s` }}/>)}
      <style>{`@keyframes b{0%,80%,100%{transform:scale(.6);opacity:.4}40%{transform:scale(1);opacity:1}}`}</style>
    </div>
  )

  // BUG 12 FIX: show link prompt only if NO children at all
  if (!children.length && !showLinkForm) {
    return <LinkChildPrompt userId={userId} schoolColor={sc} schoolId={school?.id ?? ''}/>
  }

  const activeChild = children.find(c => c.id === activeChildId) ?? children[0]

  return (
    <div className={styles.page}>
      <RoleNav userId={userId} profile={profile} school={school} role="parent" schoolColor={sc}/>
      <div className={styles.content}>
        <DashboardHeader userId={userId} role="parent" profile={profile} school={school} schoolColor={sc}/>
        {school?.setup_status==='trial'&&school?.trial_ends_at&&(
          <TrialBanner trialEndsAt={school.trial_ends_at} schoolId={school.id} setupStatus={school.setup_status} schoolColor={sc}/>
        )}
        <main className={styles.main}>
          <div className={styles.greeting}>
            <p className={styles.greetLabel}>Hello,</p>
            <h1 className={styles.greetName}>{profile?.full_name?.split(' ')[0]??'Parent'} 👋</h1>
          </div>

          {/* BUG 12 FIX: show all children as selectable cards */}
          {children.length > 1 && (
            <div style={{ display:'flex', gap:8, marginBottom:12, overflowX:'auto', paddingBottom:4 }}>
              {children.map(c => (
                <button
                  key={c.id}
                  onClick={() => setActiveChildId(c.id)}
                  style={{
                    padding:'6px 14px', borderRadius:999, fontSize:'0.75rem', fontWeight:700,
                    background: activeChildId === c.id ? sc : 'var(--glass-bg)',
                    color:      activeChildId === c.id ? '#fff' : 'var(--text-muted)',
                    border:`1px solid ${activeChildId === c.id ? sc : 'var(--glass-border)'}`,
                    cursor:'pointer', flexShrink:0,
                  }}>
                  {c.full_name?.split(' ')[0]}
                </button>
              ))}
            </div>
          )}

          {activeChild && (
            <div className={styles.childCard} style={{ borderColor:sc+'40' }}>
              <div className={styles.childAvatar} style={{ background:sc }}>
                {activeChild.avatar_url
                  ? <img src={activeChild.avatar_url} alt="" style={{ width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%' }}/>
                  : <span style={{ fontWeight:800,color:'#fff',fontSize:'1.1rem' }}>{activeChild.full_name?.[0]}</span>
                }
              </div>
              <div className={styles.childInfo}>
                <p className={styles.childName}>{activeChild.full_name}</p>
                <p className={styles.childMeta}>{activeChild.class_level} · {activeChild.default_code} · {school?.name}</p>
              </div>
              {/* BUG 12 FIX: pass child id as query param so child page shows correct child */}
              <Link href={`/dashboard/parent/child?id=${activeChild.id}`} className={styles.viewChildBtn} style={{ borderColor:sc+'40',color:sc }}>View →</Link>
            </div>
          )}

          {/* Child stats — attendance, GPA, rank, tasks */}
          {activeChild && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:16 }}>
              {[
                { label:'Attendance', value: statsLoading ? '…' : childStats.attendance != null ? `${childStats.attendance}%` : '—', color:'#10B981' },
                { label:'Term GPA',   value: statsLoading ? '…' : childStats.gpa        != null ? childStats.gpa.toFixed(1)       : '—', color: sc      },
                { label:'Class Rank', value: statsLoading ? '…' : childStats.rank       != null ? `#${childStats.rank}`           : '—', color:'#8B5CF6' },
                { label:'Tasks Due',  value: statsLoading ? '…' : childStats.pendingTasks,                                               color:'#F59E0B' },
              ].map(s => (
                <div key={s.label} style={{ background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:10, padding:'10px 14px' }}>
                  <p style={{ margin:'0 0 2px', fontSize:'1.1rem', fontWeight:800, color:s.color }}>{s.value}</p>
                  <p style={{ margin:0, fontSize:'0.65rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* BUG 12 FIX: "Link another child" button */}
          <button
            onClick={() => setShowLinkForm(true)}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 16px', marginBottom:20,
              background:'var(--glass-bg)', border:`1px solid ${sc}40`, borderRadius:999,
              color:sc, fontWeight:700, fontSize:'0.75rem', cursor:'pointer' }}>
            + Link Another Child
          </button>

          {showLinkForm && (
            <div style={{ marginBottom:16 }}>
              <LinkChildPrompt
                userId={userId}
                schoolColor={sc}
                schoolId={school?.id ?? ''}
              />
              <button onClick={() => setShowLinkForm(false)}
                style={{ marginTop:8, fontSize:'0.75rem', color:'var(--text-muted)', background:'none', border:'none', cursor:'pointer' }}>
                Cancel
              </button>
            </div>
          )}

          <p className={styles.sectionLabel}>Parent Portal</p>
          <div className={styles.moduleGrid}>
            {MODULES.map(m=>(
              <Link key={m.id} href={m.href} className={`${styles.moduleCard} ${isActive(m.href)?styles.modActive:''}`}>
                <div className={styles.modIcon} style={{ background:m.bg }}><m.Icon size={20} color={m.accent}/></div>
                <span className={styles.modLabel}>{m.label}</span>
              </Link>
            ))}
          </div>
          <div className={styles.mobileSpace}/>
        </main>
      </div>
      <ChatWidget userId={userId} role="parent" schoolColor={sc}/>
    </div>
  )
   }
   
