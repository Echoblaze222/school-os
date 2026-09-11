'use client'
// src/app/dashboard/student/StudentDashboardClient.tsx

import Link from 'next/link'
import ChatWidget from '@/components/ChatWidget'
import RecentActivity, { ActivityItem } from '@/components/RecentActivity'
import RoleHeroHeader from '@/components/RoleHeroHeader'
import ContextSwitcher from '@/components/ContextSwitcher'
import GaugeStat from '@/components/GaugeStat'
import KpiCard from '@/components/KpiCard'
import AiInsightBanner from '@/components/AiInsightBanner'
import BottomDock from '@/components/BottomDock'
import { STUDENT_FEATURE_GROUPS as FEATURE_GROUPS } from './featureGroups'
import { ClipboardIcon, TrophyIcon } from '@/components/Icons'
import styles from './student-dashboard.module.css'
import motion from '@/components/dashboard-motion.module.css'

interface Counts {
  pendingTasks: number; upcomingQuizzes: number; isLive: boolean
  notifications: number; attendance: number | null; gpa: number | null; rank: number | null
}
interface Props { profile: any; school: any; userId: string; counts?: Counts; activities: ActivityItem[] }

function buildInsight(counts: Counts, firstName: string): string {
  if (counts.isLive) {
    return `A live class is happening right now. Join before it wraps up.`
  }
  if ((counts.attendance ?? 100) < 80) {
    return `Your attendance is at ${counts.attendance}% this term, a bit below where it usually sits. Missing more could start affecting your standing.`
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
    <div className={styles.page}>
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

      <ContextSwitcher />

      <main className={styles.main}>

        {c.isLive && (
          <Link
            href="/dashboard/student/classes"
            className={`glass-card ${motion.riseIn} ${motion.pressable} ${styles.liveBanner}`}
          >
            <span className={`${styles.liveDot} ${motion.pulseDot}`} />
            <span className={styles.liveBannerLabel}>A class is live right now, tap to join</span>
          </Link>
        )}

        <div className={`${motion.riseIn} ${styles.gaugeGrid} ${c.isLive ? '' : styles.withTopSpace}`}>
          <div className={`glass-card ${motion.pressable} ${styles.gaugeCard}`}>
            <GaugeStat label="My attendance" value={c.attendance ?? 0} isPercent
              color="var(--status-ok, #3FA66B)" caption="this term" />
          </div>
          <div className={`glass-card ${motion.pressable} ${styles.gaugeCard}`}>
            <GaugeStat
              label="Term GPA"
              value={c.gpa != null ? Math.round((c.gpa / 5) * 100) : 0}
              isPercent
              displayValue={c.gpa != null ? c.gpa.toFixed(1) : 'N/A'}
              color="var(--brand-2, var(--brand))" caption="out of 5.0" delayMs={80}
            />
          </div>
          <div className={`glass-card ${motion.pressable} ${styles.gaugeCard}`}>
            <GaugeStat label="Tasks due" value={c.pendingTasks}
              color="var(--status-warn, #E4572E)" caption="this week" delayMs={160} />
          </div>
        </div>

        <div className={styles.insightRow}>
          <AiInsightBanner
            insight={buildInsight(c, firstName)}
            actionLabel="Ask AI Tutor →"
            actionHref="/dashboard/student/ai"
          />
        </div>

        <div className={styles.statsGrid}>
          <KpiCard label="Open Quizzes" value={c.upcomingQuizzes} icon={<ClipboardIcon size={16} />} context="Not yet taken" />
          <KpiCard label="Class Rank" value={c.rank ? `#${c.rank}` : 'N/A'} icon={<TrophyIcon size={16} />} context="Current standing" />
        </div>

        <RecentActivity
          items={activities}
          accentColor={schoolColor}
          onDelete={handleDeleteActivity}
          emptyLabel="Nothing yet. Assignments, grades, and messages will show up here"
        />

        <div className={styles.mobileSpace} />
      </main>

      <BottomDock aiHref="/dashboard/student/ai" groups={FEATURE_GROUPS} role="student" />
      <ChatWidget userId={userId} role="student" schoolColor={schoolColor} />
    </div>
  )
}
