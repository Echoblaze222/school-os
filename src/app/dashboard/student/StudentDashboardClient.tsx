'use client'
// src/app/dashboard/student/StudentDashboardClient.tsx

import Link from 'next/link'
import ChatWidget from '@/components/ChatWidget'
import RecentActivity, { ActivityItem } from '@/components/RecentActivity'
import RoleHeroHeader from '@/components/RoleHeroHeader'
import ContextSwitcher from '@/components/ContextSwitcher'
import AiInsightBanner from '@/components/AiInsightBanner'
import BottomDock from '@/components/BottomDock'
import { STUDENT_FEATURE_GROUPS as FEATURE_GROUPS } from './featureGroups'
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
        headline={c.gpa != null ? `${c.gpa.toFixed(1)}/5.0 GPA · ${c.attendance ?? 0}% attendance` : 'Your day, at a glance.'}
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

        <div className={`${motion.riseIn} ${c.isLive ? '' : styles.withTopSpace}`} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 12, marginBottom: 'var(--space-4)' }}>
          <div className="glass-card-flat" style={{ padding: 18, borderRadius: 'var(--radius-xl)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>Term GPA</p>
            <p style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>
              {c.gpa != null ? c.gpa.toFixed(1) : 'N/A'}
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}> / 5.0</span>
            </p>
            <div style={{ display: 'flex', gap: 20, paddingTop: 10, marginTop: 2, borderTop: '1px solid var(--glass-border)' }}>
              <div>
                <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-muted)' }}>Class rank</p>
                <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>{c.rank ? `#${c.rank}` : 'N/A'}</p>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="glass-card-flat" style={{ padding: '12px 14px', borderRadius: 'var(--radius-lg)', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
              <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-muted)' }}>Attendance</p>
              <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: (c.attendance ?? 100) < 80 ? 'var(--status-warn, #E4572E)' : 'var(--text-primary)' }}>{c.attendance ?? 0}%</p>
            </div>
            <div className="glass-card-flat" style={{ padding: '12px 14px', borderRadius: 'var(--radius-lg)', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
              <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-muted)' }}>Tasks due</p>
              <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: c.pendingTasks > 0 ? 'var(--status-warn, #E4572E)' : 'var(--text-primary)' }}>{c.pendingTasks}</p>
            </div>
            <div className="glass-card-flat" style={{ padding: '12px 14px', borderRadius: 'var(--radius-lg)', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
              <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-muted)' }}>Open quizzes</p>
              <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>{c.upcomingQuizzes}</p>
            </div>
          </div>
        </div>

        <div className={styles.insightRow}>
          <AiInsightBanner
            insight={buildInsight(c, firstName)}
            actionLabel="Ask AI Tutor →"
            actionHref="/dashboard/student/ai"
          />
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
