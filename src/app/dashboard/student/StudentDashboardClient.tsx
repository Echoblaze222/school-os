'use client'
// src/app/dashboard/student/StudentDashboardClient.tsx

import Link from 'next/link'
import ChatWidget from '@/components/ChatWidget'
import RecentActivity, { ActivityItem } from '@/components/RecentActivity'
import RoleHeroHeader from '@/components/RoleHeroHeader'
import GaugeStat from '@/components/GaugeStat'
import AiInsightBanner from '@/components/AiInsightBanner'
import BottomDock from '@/components/BottomDock'
import { FeatureGroup } from '@/components/AllFeaturesSheet'
import {
  ClipboardIcon, ClockIcon, VideoIcon, BarChartIcon, AwardIcon,
  BookIcon, MessageIcon, CalendarIcon, FileTextIcon, BookOpenIcon,
  GlobeIcon, TrophyIcon, IdCardIcon,
} from '@/components/Icons'
import styles from './student-dashboard.module.css'
import motion from '@/components/dashboard-motion.module.css'

const FEATURE_GROUPS: FeatureGroup[] = [
  { name: 'Learning', items: [
    { id: 'assignments', label: 'Assignments', href: '/dashboard/student/assignments', Icon: ClipboardIcon },
    { id: 'results',     label: 'Results',     href: '/dashboard/student/results',     Icon: BarChartIcon },
    { id: 'quizzes',     label: 'Quizzes',     href: '/dashboard/student/quizzes',     Icon: AwardIcon },
    { id: 'classes',     label: 'Live classes',href: '/dashboard/student/classes',     Icon: VideoIcon },
    { id: 'notes',       label: 'Notes',       href: '/dashboard/student/notes',       Icon: BookIcon },
    { id: 'syllabus',    label: 'Syllabus',    href: '/dashboard/student/syllabus',    Icon: BookOpenIcon },
  ]},
  { name: 'Around school', items: [
    { id: 'timetable',   label: 'Timetable',   href: '/dashboard/student/timetable',   Icon: ClockIcon },
    { id: 'library',     label: 'Library',     href: '/dashboard/student/library',     Icon: BookIcon },
    { id: 'leaderboard', label: 'Leaderboard', href: '/dashboard/student/leaderboard', Icon: TrophyIcon },
    { id: 'id-card',     label: 'My ID card',  href: '/dashboard/student/id-card',     Icon: IdCardIcon },
    { id: 'records',     label: 'Records',     href: '/dashboard/student/records',     Icon: FileTextIcon },
    { id: 'alumni',      label: 'Alumni',      href: '/dashboard/student/alumni',      Icon: GlobeIcon },
  ]},
  { name: 'Communication', items: [
    { id: 'chat',     label: 'Messages', href: '/dashboard/student/chat',     Icon: MessageIcon },
    { id: 'meetings', label: 'Meetings', href: '/dashboard/student/meetings', Icon: CalendarIcon },
    { id: 'schedule', label: 'Study plan',href: '/dashboard/student/schedule',Icon: CalendarIcon },
  ]},
]

interface Counts {
  pendingTasks: number; upcomingQuizzes: number; isLive: boolean
  notifications: number; attendance: number | null; gpa: number | null; rank: number | null
}
interface Props { profile: any; school: any; userId: string; counts?: Counts; activities: ActivityItem[] }

function buildInsight(counts: Counts, firstName: string): string {
  if (counts.isLive) {
    return `A live class is happening right now — join before it wraps up.`
  }
  if ((counts.attendance ?? 100) < 80) {
    return `Your attendance is at ${counts.attendance}% this term — a bit below where it usually sits. Missing more could start affecting your standing.`
  }
  if (counts.pendingTasks > 0) {
    return `You have ${counts.pendingTasks} assignment${counts.pendingTasks === 1 ? '' : 's'} due, and ${counts.upcomingQuizzes} quiz${counts.upcomingQuizzes === 1 ? '' : 'zes'} open right now.`
  }
  return `You're all caught up on assignments${counts.rank ? `, sitting at #${counts.rank} in your class` : ''}. Nice work.`
}

export default function StudentDashboardClient({ profile, school, userId, counts, activities }: Props) {
  const c = counts ?? { pendingTasks: 0, upcomingQuizzes: 0, isLive: false, notifications: 0, attendance: null, gpa: null, rank: null }
  const schoolColor = school?.primary_color ?? '#7C3AED'
  const firstName   = profile?.full_name?.split(' ')[0] ?? 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  async function handleDeleteActivity(id: string) {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.from('recent_activities').delete().eq('id', id).eq('user_id', userId)
  }

  return (
    <div className={styles.page} style={{ background: 'color-mix(in srgb, var(--brand) 6%, var(--bg-base))' }}>
      <RoleHeroHeader
        userId={userId}
        role="student"
        roleLabel="Student"
        profile={profile}
        school={school}
        greeting={`${greeting}, ${firstName}`}
        headline="Your day, at a glance."
        sub={c.rank ? `Rank #${c.rank} in class this term` : school?.name ?? ''}
        featureGroups={FEATURE_GROUPS}
      />

      <main className={styles.main}>

        {c.isLive && (
          <Link href="/dashboard/student/classes" className={`glass-card ${motion.riseIn} ${motion.pressable}`} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 'var(--radius-xl)',
            marginTop: 'var(--space-6)', marginBottom: 'var(--space-3)',
            border: '1px solid var(--status-warn, #E4572E)', textDecoration: 'none',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--status-warn, #E4572E)' }} className={motion.pulseDot} />
            <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>A class is live right now — tap to join</span>
          </Link>
        )}

        <div className={motion.riseIn} style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))', gap: 12,
          marginTop: c.isLive ? 0 : 'var(--space-6)', marginBottom: 'var(--space-4)',
        }}>
          <div className={`glass-card ${motion.pressable}`} style={{ padding: 16, borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
            <GaugeStat label="My attendance" value={c.attendance ?? 0} isPercent
              color="var(--status-ok, #3FA66B)" caption="this term" />
          </div>
          <div className={`glass-card ${motion.pressable}`} style={{ padding: 16, borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
            <GaugeStat
              label="Term GPA"
              value={c.gpa != null ? Math.round((c.gpa / 5) * 100) : 0}
              isPercent
              displayValue={c.gpa != null ? c.gpa.toFixed(1) : '—'}
              color="var(--brand-2, var(--brand))" caption="out of 5.0" delayMs={80}
            />
          </div>
          <div className={`glass-card ${motion.pressable}`} style={{ padding: 16, borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
            <GaugeStat label="Tasks due" value={c.pendingTasks}
              color="var(--status-warn, #E4572E)" caption="this week" delayMs={160} />
          </div>
        </div>

        <div style={{ marginBottom: 'var(--space-4)' }}>
          <AiInsightBanner
            insight={buildInsight(c, firstName)}
            actionLabel="Ask AI Tutor →"
            actionHref="/dashboard/student/ai"
          />
        </div>

        <div className={styles.statsGrid} style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          {[
            { label: 'Open quizzes', value: c.upcomingQuizzes },
            { label: 'Class rank',   value: c.rank ? `#${c.rank}` : '—' },
          ].map((s, i) => (
            <div
              key={s.label}
              className={`${styles.statCard} ${motion.staggerItem} ${motion.pressable}`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <p className={styles.statVal}>{s.value}</p>
              <p className={styles.statLbl}>{s.label}</p>
            </div>
          ))}
        </div>

        <RecentActivity
          items={activities}
          accentColor={schoolColor}
          onDelete={handleDeleteActivity}
          emptyLabel="Nothing yet — assignments, grades, and messages will show up here"
        />

        <div className={styles.mobileSpace} />
      </main>

      <BottomDock homeHref="/dashboard/student" aiHref="/dashboard/student/ai" />
      <ChatWidget userId={userId} role="student" schoolColor={schoolColor} />
    </div>
  )
}
