'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import StudentNav from '@/components/StudentNav'
import DashboardHeader from '@/components/DashboardHeader'
import TrialBanner from '@/components/TrialBanner'
import ChatWidget from '@/components/ChatWidget'
import RecentActivity, { ActivityItem } from '@/components/RecentActivity'   // ← NEW
import {
  ClipboardIcon, BarChartIcon, AwardIcon, TrophyIcon,
  VideoIcon, BookIcon, AiIcon, MessageIcon, CalendarIcon,
  FileTextIcon, BookOpenIcon, GlobeIcon, IdCardIcon,
  MegaphoneIcon, ClockIcon, FlameIcon,
} from '@/components/Icons'
import styles from './student-dashboard.module.css'
import motion from '@/components/dashboard-motion.module.css'               // ← NEW

const MODULES = [
  // ...unchanged, same as your current file
]

const QUICK_LINKS = [
  // ...unchanged
]

// ...getStreak / updateStreak / getCurrentTerm / getCurrentYear unchanged

interface Props {
  profile: any; school: any; userId: string
  counts: {
    pendingTasks:    number
    upcomingQuizzes: number
    isLive:          boolean
    notifications:   number
    attendance:      number | null
    rank:            number | null
    gpa:             number | null
  }
  activities: ActivityItem[]   // ← NEW — passed from page.tsx (server-fetched)
}

export default function StudentDashboardClient({ profile, school, userId, counts, activities }: Props) {
  const pathname  = usePathname()
  const [streak,   setStreak]   = useState(0)
  const [greeting, setGreeting] = useState('')

  const [attendance,  setAttendance]  = useState<number | null>(counts.attendance)
  const [rank,        setRank]        = useState<number | null>(counts.rank)
  const [gpa,         setGpa]         = useState<number | null>(counts.gpa)
  const [statsReady,  setStatsReady]  = useState(
    counts.attendance !== null || counts.rank !== null || counts.gpa !== null
  )

  const schoolColor = school?.primary_color ?? '#7C3AED'
  const firstName   = profile?.full_name?.split(' ')[0] ?? 'Student'

  useEffect(() => {
    updateStreak()
    setStreak(getStreak())
    const h = new Date().getHours()
    setGreeting(h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening')
    if (!statsReady) loadStats()
  }, [])

  async function loadStats() {
    // ...unchanged, same as your current file
  }

  function isActive(href: string) {
    if (href === '/dashboard/student') return pathname === href
    return pathname.startsWith(href)
  }

  // ── NEW: delete handler wired to Supabase ──────────────────────────────
  async function handleDeleteActivity(id: string) {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.from('recent_activities').delete().eq('id', id).eq('user_id', userId)
  }

  return (
    <div className={styles.page}>
      <StudentNav userId={userId} profile={profile} school={school} schoolColor={schoolColor} />

      <div className={styles.content}>
        <DashboardHeader
          userId={userId} role="student"
          profile={profile} school={school}
          schoolColor={schoolColor}
        />

        {school?.setup_status === 'trial' && school?.trial_ends_at && (
          <TrialBanner
            trialEndsAt={school.trial_ends_at}
            schoolId={school.id}
            setupStatus={school.setup_status}
            schoolColor={schoolColor}
          />
        )}

        <main className={styles.main}>

          {/* Greeting — now animates in, emoji waves once */}
          <section className={`${styles.greeting} ${motion.riseIn}`}>
            <p className={styles.greetLabel}>{greeting},</p>
            <h1 className={styles.greetName}>
              {firstName} <span className={motion.waveEmoji}>👋</span>
            </h1>
            {streak > 0 && (
              <div className={styles.streakBadge}>
                <FlameIcon size={13} color="#F59E0B" />
                {streak}-day study streak — keep it up!
              </div>
            )}
          </section>

          {/* Stats row — each card staggers in */}
          <div className={styles.statsGrid}>
            {[
              { label: 'Pending',    value: counts.pendingTasks,                                       color: '#3B82F6', bg: '#1e3a5f', Icon: ClipboardIcon },
              { label: 'Quizzes',    value: counts.upcomingQuizzes,                                    color: '#F59E0B', bg: '#4a3510', Icon: AwardIcon     },
              { label: 'Attendance', value: !statsReady ? '…' : attendance != null ? `${attendance}%` : '—', color: '#10B981', bg: '#1a4a3a', Icon: BarChartIcon  },
              { label: 'Class Rank', value: !statsReady ? '…' : rank       != null ? `#${rank}`       : '—', color: '#8B5CF6', bg: '#2e1f5e', Icon: TrophyIcon    },
            ].map((s, i) => (
              <div
                key={s.label}
                className={`${styles.statCard} ${motion.staggerItem} ${motion.pressable}`}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className={styles.statIcon} style={{ background: s.bg }}>
                  <s.Icon size={15} color={s.color} />
                </div>
                <div>
                  <p className={`${styles.statVal} ${!statsReady ? motion.shimmer : ''}`}>{s.value}</p>
                  <p className={styles.statLbl}>{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* GPA bar — fill animates in on mount */}
          <div className={`${styles.gpaCard} ${motion.riseIn}`} style={{ animationDelay: '180ms' }}>
            <div className={styles.gpaLeft}>
              <p className={styles.gpaLabel}>Term GPA</p>
              <p className={styles.gpaValue}>{!statsReady ? '…' : gpa != null ? gpa.toFixed(1) : '—'}</p>
              <p className={styles.gpaSub}>/ 5.0</p>
            </div>
            <div className={styles.gpaRight}>
              <div className={styles.gpaTrack}>
                <div
                  className={`${styles.gpaFill} ${motion.barFillIn}`}
                  style={{
                    width: `${gpa != null ? (gpa / 5) * 100 : 0}%`,
                    background: `linear-gradient(90deg,${schoolColor},#EC4899)`,
                    transformOrigin: 'left',
                  }}
                />
              </div>
              <div className={styles.liveRow}>
                {counts.isLive
                  ? <><span className={`${styles.liveDot} ${motion.pulseDot}`} /> Live class now</>
                  : <><span className={styles.noLiveDot} /> No live class</>
                }
              </div>
            </div>
          </div>

          {/* Module grid — staggered entrance + tap feedback */}
          <p className={styles.sectionLabel}>Your Modules</p>
          <div className={styles.moduleGrid}>
            {MODULES.map((mod, i) => (
              <Link
                key={mod.id}
                href={mod.href}
                className={`${styles.moduleCard} ${motion.staggerItem} ${motion.pressable} ${isActive(mod.href) ? styles.modActive : ''}`}
                style={{ animationDelay: `${220 + i * 35}ms` }}
              >
                <div className={styles.modIcon} style={{ background: mod.bg }}>
                  <mod.Icon size={20} color={mod.accent} />
                </div>
                <span className={styles.modLabel}>{mod.label}</span>
                {mod.id === 'classes' && counts.isLive &&
                  <span className={styles.livePill}>LIVE</span>}
                {mod.id === 'assignments' && counts.pendingTasks > 0 &&
                  <span className={styles.countPill}>{counts.pendingTasks}</span>}
              </Link>
            ))}
          </div>

          {/* NEW: Recent Activity feed */}
          <RecentActivity
            items={activities}
            accentColor={schoolColor}
            onDelete={handleDeleteActivity}
            emptyLabel="Nothing yet — your recent actions will show up here"
          />

          {/* Quick links */}
          <p className={styles.sectionLabel}>Quick Access</p>
          <div className={styles.quickGrid}>
            {QUICK_LINKS.map((q, i) => (
              <Link
                key={q.href}
                href={q.href}
                className={`${styles.quickCard} ${motion.staggerItem} ${motion.pressable}`}
                style={{ animationDelay: `${400 + i * 40}ms` }}
              >
                <q.Icon size={16} color={schoolColor} />
                <span>{q.label}</span>
              </Link>
            ))}
          </div>

          <div className={styles.mobileSpace} />
        </main>
      </div>

      <ChatWidget userId={userId} role="student" schoolColor={schoolColor} />
    </div>
  )
}
