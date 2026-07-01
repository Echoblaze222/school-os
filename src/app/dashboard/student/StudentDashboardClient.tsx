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
  { id: 'assignments', label: 'Assignments',  Icon: ClipboardIcon, href: '/dashboard/student/assignments', accent: '#3B82F6', bg: '#1e3a5f' },
  { id: 'timetable',   label: 'Timetable',    Icon: ClockIcon,     href: '/dashboard/student/timetable',   accent: '#8B5CF6', bg: '#2e1f5e' },
  { id: 'classes',     label: 'Live Classes', Icon: VideoIcon,     href: '/dashboard/student/classes',     accent: '#EF4444', bg: '#5f1e1e' },
  { id: 'results',     label: 'Results',      Icon: BarChartIcon,  href: '/dashboard/student/results',     accent: '#10B981', bg: '#1a4a3a' },
  { id: 'quizzes',     label: 'Quizzes',      Icon: AwardIcon,     href: '/dashboard/student/quizzes',     accent: '#F59E0B', bg: '#4a3510' },
  { id: 'notes',       label: 'Notes',        Icon: BookIcon,      href: '/dashboard/student/notes',       accent: '#6366F1', bg: '#1e2060' },
  { id: 'ai',          label: 'AI Tutor',     Icon: AiIcon,        href: '/dashboard/student/ai',          accent: '#EC4899', bg: '#5a1a40' },
  { id: 'chat',        label: 'Messages',     Icon: MessageIcon,   href: '/dashboard/student/chat',        accent: '#14B8A6', bg: '#0f3d38' },
  { id: 'schedule',    label: 'Study Plan',   Icon: CalendarIcon,  href: '/dashboard/student/schedule',    accent: '#F97316', bg: '#4a2810' },
  { id: 'meetings',    label: 'Meetings',     Icon: CalendarIcon,  href: '/dashboard/student/meetings',    accent: '#06B6D4', bg: '#0a3040' },
  { id: 'records',     label: 'Records',      Icon: FileTextIcon,  href: '/dashboard/student/records',     accent: '#64748B', bg: '#1e2a38' },
  { id: 'syllabus',    label: 'Syllabus',     Icon: BookOpenIcon,  href: '/dashboard/student/syllabus',    accent: '#06B6D4', bg: '#0a3040' },
  { id: 'alumni',      label: 'Alumni',       Icon: GlobeIcon,     href: '/dashboard/student/alumni',     accent: '#A855F7', bg: '#2d1060' },
]

const QUICK_LINKS = [
  { label: 'My ID Card',   Icon: IdCardIcon,    href: '/dashboard/student/id-card'       },
  { label: 'Leaderboard',  Icon: TrophyIcon,    href: '/dashboard/student/leaderboard'   },
  { label: 'Study Plan',   Icon: CalendarIcon,  href: '/dashboard/student/schedule'      },
  { label: 'Notice Board', Icon: MegaphoneIcon, href: '/dashboard/student/announcements' },
]

function getStreak() {
  try {
    const raw = localStorage.getItem('schoolos_streak')
    if (!raw) return 0
    const { count, lastDate } = JSON.parse(raw)
    const today     = new Date().toDateString()
    const yesterday = new Date(Date.now() - 86400000).toDateString()
    if (lastDate === today || lastDate === yesterday) return count
    return 0
  } catch { return 0 }
}

function updateStreak() {
  try {
    const today     = new Date().toDateString()
    const yesterday = new Date(Date.now() - 86400000).toDateString()
    const raw = localStorage.getItem('schoolos_streak')
    if (raw) {
      const { count, lastDate } = JSON.parse(raw)
      if (lastDate === today) return
      localStorage.setItem('schoolos_streak', JSON.stringify({
        count: lastDate === yesterday ? count + 1 : 1,
        lastDate: today,
      }))
    } else {
      localStorage.setItem('schoolos_streak', JSON.stringify({ count: 1, lastDate: today }))
    }
  } catch {}
}

// FIX: term values match DB enum
function getCurrentTerm(): string {
  const month = new Date().getMonth() + 1
  if (month >= 9 || month <= 1) return 'First Term'
  if (month >= 5)               return 'Third Term'
  return 'Second Term'
}
function getCurrentYear(): string {
  const now = new Date(); const month = now.getMonth() + 1; const y = now.getFullYear()
  return month >= 9 ? `${y}/${y + 1}` : `${y - 1}/${y}`
}

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

  // Live stats loaded client-side so the server page stays fast
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

    // If server didn't pre-compute stats, load them client-side
    if (!statsReady) loadStats()
  }, [])

  async function loadStats() {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase     = createClient()
    const currentTerm  = getCurrentTerm()
    const currentYear  = getCurrentYear()

    // Need student's class_id from student_profiles
    const { data: sp } = await supabase
      .from('student_profiles')
      .select('class_id')
      .eq('id', userId)
      .single()

    const classId = sp?.class_id

    const [
      { data: attendanceRows },
      { data: resultRows },
      { data: leaderboardRows },
    ] = await Promise.all([
      // Attendance
      supabase
        .from('attendance')
        .select('status, is_present')
        .eq('student_id', userId)
        .eq('school_id', school?.id),

      // Results — approved, current term
      supabase
        .from('results')
        .select('score, max_score')
        .eq('student_id', userId)
        .eq('school_id', school?.id)
        .eq('term', currentTerm)
        .eq('academic_year', currentYear)
        .eq('approved', true),

      // Leaderboard rank
      classId
        ? supabase
            .from('student_leaderboard')
            .select('student_id, total_points')
            .eq('class_id', classId)
            .eq('school_id', school?.id)
            .eq('term', currentTerm)
            .eq('academic_year', currentYear)
            .order('total_points', { ascending: false })
        : Promise.resolve({ data: [] }),
    ])

    // Attendance %
    const totalDays   = attendanceRows?.length ?? 0
    const presentDays = attendanceRows?.filter(r =>
      r.status === 'present' || (!r.status && r.is_present === true)
    ).length ?? 0
    setAttendance(totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : null)

    // GPA on 5.0 scale
    const valid = resultRows?.filter(r => r.score != null && (r.max_score ?? 0) > 0) ?? []
    setGpa(valid.length > 0
      ? Math.round(((valid.reduce((s, r) => s + (r.score! / r.max_score), 0) / valid.length) * 5) * 10) / 10
      : null
    )

    // Rank
    const pos = leaderboardRows?.findIndex(r => r.student_id === userId) ?? -1
    setRank(pos >= 0 ? pos + 1 : null)

    setStatsReady(true)
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
