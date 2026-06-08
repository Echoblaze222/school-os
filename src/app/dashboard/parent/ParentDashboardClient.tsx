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
  { id:'chat',        label:'Message School',   Icon:MessageIcon,  href:'/dashboard/parent/chat',        accent:'#7C3AED', bg:'#2d1060' },
]

interface Props { profile: any; school: any; userId: string; counts?: any }

export default function ParentDashboardClient({ profile, school, userId, counts = {} }: Props) {
  const pathname = usePathname()
  const [child,    setChild]   = useState<any>(null)
  const [checking, setChecking]= useState(true)
  const supabase   = createClient()
  const sc         = school?.primary_color ?? '#7C3AED'

  useEffect(() => {
    supabase.from('profiles').select('id,full_name,class_level,avatar_url,default_code')
      .eq('parent_id', userId).single()
      .then(({ data }) => { setChild(data ?? null); setChecking(false) })
  }, [userId])

  function isActive(href: string) { return pathname.startsWith(href) }

  if (checking) return (
    <div style={{ minHeight:'100dvh', background:'var(--bg-base)', display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}>
      {[0,1,2].map(i=><div key={i} style={{ width:8,height:8,borderRadius:'50%',background:'var(--brand)',animation:'b 1.2s ease infinite',animationDelay:`${i*0.2}s` }}/>)}
      <style>{`@keyframes b{0%,80%,100%{transform:scale(.6);opacity:.4}40%{transform:scale(1);opacity:1}}`}</style>
    </div>
  )

  if (!child) return <LinkChildPrompt userId={userId} schoolColor={sc} schoolId={school?.id ?? ''}/>

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
          <div className={styles.childCard} style={{ borderColor:sc+'40' }}>
            <div className={styles.childAvatar} style={{ background:sc }}>
              {child.avatar_url
                ? <img src={child.avatar_url} alt="" style={{ width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%' }}/>
                : <span style={{ fontWeight:800,color:'#fff',fontSize:'1.1rem' }}>{child.full_name?.[0]}</span>
              }
            </div>
            <div className={styles.childInfo}>
              <p className={styles.childName}>{child.full_name}</p>
              <p className={styles.childMeta}>{child.class_level} · {child.default_code} · {school?.name}</p>
            </div>
            <Link href="/dashboard/parent/child" className={styles.viewChildBtn} style={{ borderColor:sc+'40',color:sc }}>View →</Link>
          </div>
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
