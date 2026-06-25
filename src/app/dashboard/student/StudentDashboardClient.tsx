'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import StudentNav from '@/components/StudentNav'
import DashboardHeader from '@/components/DashboardHeader'
import TrialBanner from '@/components/TrialBanner'
import ChatWidget from '@/components/ChatWidget'
import {
  ClipboardIcon, BarChartIcon, AwardIcon, TrophyIcon,
  VideoIcon, BookIcon, AiIcon, MessageIcon, CalendarIcon,
  FileTextIcon, BookOpenIcon, GlobeIcon, IdCardIcon,
  MegaphoneIcon, ClockIcon, FlameIcon,
} from '@/components/Icons'
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder'
import styles from './student-dashboard.module.css'

const MODULES = [
  { id: 'assignments',   label: 'Assignments',   Icon: ClipboardIcon, href: '/dashboard/student/assignments',   accent: '#3B82F6', bg: '#1e3a5f' },
  { id: 'timetable',     label: 'Timetable',     Icon: ClockIcon,     href: '/dashboard/student/timetable',     accent: '#8B5CF6', bg: '#2e1f5e' },
  { id: 'classes',       label: 'Live Classes',  Icon: VideoIcon,     href: '/dashboard/student/classes',       accent: '#EF4444', bg: '#5f1e1e' },
  { id: 'results',       label: 'Results',       Icon: BarChartIcon,  href: '/dashboard/student/results',       accent: '#10B981', bg: '#1a4a3a' },
  { id: 'quizzes',       label: 'Quizzes',       Icon: AwardIcon,     href: '/dashboard/student/quizzes',       accent: '#F59E0B', bg: '#4a3510' },
  { id: 'notes',         label: 'Notes',         Icon: BookIcon,      href: '/dashboard/student/notes',         accent: '#6366F1', bg: '#1e2060' },
  { id: 'ai',            label: 'AI Tutor',      Icon: AiIcon,        href: '/dashboard/student/ai',            accent: '#EC4899', bg: '#5a1a40' },
  { id: 'chat',          label: 'Messages',      Icon: MessageIcon,   href: '/dashboard/student/chat',          accent: '#14B8A6', bg: '#0f3d38' },
  { id: 'schedule',      label: 'Study Plan',    Icon: CalendarIcon,  href: '/dashboard/student/schedule',      accent: '#F97316', bg: '#4a2810' },
  { id: 'meetings',      label: 'Meetings',      Icon: CalendarIcon,  href: '/dashboard/student/meetings',      accent: '#06B6D4', bg: '#0a3040' },
  { id: 'records',       label: 'Records',       Icon: FileTextIcon,  href: '/dashboard/student/records',       accent: '#64748B', bg: '#1e2a38' },
  { id: 'syllabus',      label: 'Syllabus',      Icon: BookOpenIcon,  href: '/dashboard/student/syllabus',      accent: '#06B6D4', bg: '#0a3040' },
  { id: 'alumni',        label: 'Alumni',        Icon: GlobeIcon,     href: '/dashboard/student/alumni',        accent: '#A855F7', bg: '#2d1060' },
]

const QUICK_LINKS = [
  { label: 'My ID Card',    Icon: IdCardIcon,    href: '/dashboard/student/id-card'      },
  { label: 'Leaderboard',   Icon: TrophyIcon,    href: '/dashboard/student/leaderboard'  },
  { label: 'Study Plan',    Icon: CalendarIcon,  href: '/dashboard/student/schedule'     },
  { label: 'Notice Board',  Icon: MegaphoneIcon, href: '/dashboard/student/announcements'},
]

function getStreak() {
  try {
    const raw = localStorage.getItem('schoolos_streak')
    if (!raw) return 0
    const { count, lastDate } = JSON.parse(raw)
    const today = new Date().toDateString()
    if (lastDate === today) return count
    if (new Date(Date.now() - 86400000).toDateString() === lastDate) return count
    return 0
  } catch { return 0 }
}

function updateStreak() {
  try {
    const today = new Date().toDateString()
    const raw = localStorage.getItem('schoolos_streak')
    if (raw) {
      const { count, lastDate } = JSON.parse(raw)
      if (lastDate === today) return
      const yesterday = new Date(Date.now() - 86400000).toDateString()
      localStorage.setItem('schoolos_streak', JSON.stringify({
        count: lastDate === yesterday ? count + 1 : 1, lastDate: today,
      }))
    } else {
      localStorage.setItem('schoolos_streak', JSON.stringify({ count: 1, lastDate: today }))
    }
  } catch {}
}

interface Props {
  profile: any; school: any; userId: string
  counts: { pendingTasks: number; upcomingQuizzes: number; isLive: boolean; notifications: number; attendance: number | null; rank: number | null; gpa: number | null }
}

export default function StudentDashboardClient({ profile, school, userId, counts }: Props) {
  const pathname  = usePathname()
  const [streak,  setStreak]  = useState(0)
  const [greeting,setGreeting]= useState('')
  const schoolColor = school?.primary_color ?? '#7C3AED'
  const firstName   = profile?.full_name?.split(' ')[0] ?? 'Student'
  const attendance  = counts.attendance  // null = no data yet
  const gpa         = counts.gpa         // null = no results yet
  const rank        = counts.rank        // null = not on leaderboard yet

  useEffect(() => {
    updateStreak(); setStreak(getStreak())
    const h = new Date().getHours()
    setGreeting(h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening')
  }, [])

  function isActive(href: string) {
    if (href === '/dashboard/student') return pathname === href
    return pathname.startsWith(href)
  }

  return (
    <div className={styles.page}>
      {/* Sidebar nav (desktop) + bottom nav (mobile) */}
      <StudentNav userId={userId} profile={profile} school={school} schoolColor={schoolColor} />

      {/* Main content */}
      <div className={styles.content}>
        {/* Header */}
        <DashboardHeader
          userId={userId} role="student"
          profile={profile} school={school}
          schoolColor={schoolColor}
        />

        {/* Trial banner — shows only when school is on trial */}
        {school?.setup_status === 'trial' && school?.trial_ends_at && (
          <TrialBanner
            trialEndsAt={school.trial_ends_at}
            schoolId={school.id}
            setupStatus={school.setup_status}
            schoolColor={schoolColor}
          />
        )}

        {/* Page body */}
        <main className={styles.main}>

          {/* Greeting */}
          <section className={styles.greeting}>
            <p className={styles.greetLabel}>{greeting},</p>
            <h1 className={styles.greetName}>{firstName} 👋</h1>
            {streak > 0 && (
              <div className={styles.streakBadge}>
                <FlameIcon size={13} color="#F59E0B" />
                {streak}-day study streak — keep it up!
              </div>
            )}
          </section>

          {/* Stats row */}
          <div className={styles.statsGrid}>
            {[
              { label: 'Pending',    value: counts.pendingTasks,    color: '#3B82F6', bg: '#1e3a5f', Icon: ClipboardIcon },
              { label: 'Quizzes',    value: counts.upcomingQuizzes, color: '#F59E0B', bg: '#4a3510', Icon: AwardIcon     },
              { label: 'Attendance', value: attendance != null ? `${attendance}%` : '—', color: '#10B981', bg: '#1a4a3a', Icon: BarChartIcon  },
              { label: 'Class Rank', value: rank != null ? `#${rank}` : '—',               color: '#8B5CF6', bg: '#2e1f5e', Icon: TrophyIcon    },
            ].map(s => (
              <div key={s.label} className={styles.statCard}>
                <div className={styles.statIcon} style={{ background: s.bg }}>
                  <s.Icon size={15} color={s.color} />
                </div>
                <div>
                  <p className={styles.statVal}>{s.value}</p>
                  <p className={styles.statLbl}>{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* GPA bar */}
          <div className={styles.gpaCard}>
            <div className={styles.gpaLeft}>
              <p className={styles.gpaLabel}>Term GPA</p>
              <p className={styles.gpaValue}>{gpa != null ? gpa.toFixed(1) : '—'}</p>
              <p className={styles.gpaSub}>/ 5.0</p>
            </div>
            <div className={styles.gpaRight}>
              <div className={styles.gpaTrack}>
                <div className={styles.gpaFill}
                  style={{ width: `${gpa != null ? (gpa/5)*100 : 0}%`, background: `linear-gradient(90deg,${schoolColor},#EC4899)` }} />
              </div>
              <div className={styles.liveRow}>
                {counts.isLive
                  ? <><span className={styles.liveDot}/> Live class now</>
                  : <><span className={styles.noLiveDot}/> No live class</>
                }
              </div>
            </div>
          </div>

          {/* Module grid */}
          <p className={styles.sectionLabel}>Your Modules</p>
          <div className={styles.moduleGrid}>
            {MODULES.map(mod => (
              <Link key={mod.id} href={mod.href}
                className={`${styles.moduleCard} ${isActive(mod.href) ? styles.modActive : ''}`}>
                <div className={styles.modIcon} style={{ background: mod.bg }}>
                  <mod.Icon size={20} color={mod.accent} />
                </div>
                <span className={styles.modLabel}>{mod.label}</span>
                {mod.id === 'classes' && counts.isLive && <span className={styles.livePill}>LIVE</span>}
                {mod.id === 'assignments' && counts.pendingTasks > 0 &&
                  <span className={styles.countPill}>{counts.pendingTasks}</span>}
              </Link>
            ))}
          </div>

          {/* Quick links */}
          <p className={styles.sectionLabel}>Quick Access</p>
          <div className={styles.quickGrid}>
            {QUICK_LINKS.map(q => (
              <Link key={q.href} href={q.href} className={styles.quickCard}>
                <q.Icon size={16} color={schoolColor} />
                <span>{q.label}</span>
              </Link>
            ))}
          </div>

          <div className={styles.mobileSpace} />
        </main>
      </div>

      {/* Floating chat */}
      <ChatWidget userId={userId} role="student" schoolColor={schoolColor} />
    </div>
  )
}
