'use client'

import { useEffect, useState } from 'react'
import RoleHeroHeader from '@/components/RoleHeroHeader'
import AiInsightBanner from '@/components/AiInsightBanner'
import BottomDock from '@/components/BottomDock'
import RecentActivity, { ActivityItem } from '@/components/RecentActivity'
import ChatWidget from '@/components/ChatWidget'
import ContextSwitcher from '@/components/ContextSwitcher'
import { FeatureGroup } from '@/components/AllFeaturesSheet'
import {
  HeartIcon, CalendarIcon, ShieldIcon, BarChartIcon,
  MessageIcon, BellIcon, UserIcon, AiIcon,
} from '@/components/Icons'
import styles from './counselor.module.css'
import motion from '@/components/dashboard-motion.module.css'

const FEATURE_GROUPS: FeatureGroup[] = [
  { name: 'Counseling', items: [
    { id: 'cases',        label: 'Caseload',      href: '/dashboard/counselor/cases',        Icon: HeartIcon },
    { id: 'appointments', label: 'Appointments',  href: '/dashboard/counselor/appointments',  Icon: CalendarIcon },
    { id: 'referrals',    label: 'Referrals',     href: '/dashboard/counselor/referrals',     Icon: ShieldIcon },
    { id: 'reports',      label: 'Reports',       href: '/dashboard/counselor/reports',       Icon: BarChartIcon },
    { id: 'meetings',     label: 'Meetings',      href: '/dashboard/counselor/meetings',      Icon: CalendarIcon },
  ]},
  { name: 'Communication', items: [
    { id: 'chat',          label: 'Messages',      href: '/dashboard/counselor/chat',          Icon: MessageIcon },
    { id: 'notifications', label: 'Notifications', href: '/dashboard/counselor/notifications', Icon: BellIcon },
  ]},
  { name: 'Account', items: [
    { id: 'profile', label: 'My Profile', href: '/dashboard/counselor/profile', Icon: UserIcon },
  ]},
]

interface Stats {
  openCases: number
  monitoringCases: number
  upcomingSessions: number
  pendingReferrals: number
  overdueFollowUps: number
}

interface Props {
  userId: string
  counselorName: string
  school: any
  stats: Stats
}

function insightFor(stats: Stats) {
  if (stats.overdueFollowUps > 0) {
    return `${stats.overdueFollowUps} follow-up${stats.overdueFollowUps === 1 ? ' is' : 's are'} overdue. A quick check-in could stop a case from drifting.`
  }
  if (stats.pendingReferrals > 0) {
    return `${stats.pendingReferrals} referral${stats.pendingReferrals === 1 ? ' is' : 's are'} waiting in your queue.`
  }
  if (stats.upcomingSessions > 0) {
    return `You have ${stats.upcomingSessions} counseling appointment${stats.upcomingSessions === 1 ? '' : 's'} coming up.`
  }
  return `Your caseload is steady, ${stats.openCases + stats.monitoringCases} active case${stats.openCases + stats.monitoringCases === 1 ? '' : 's'} right now.`
}

export default function CounselorDashboardClient({ userId, counselorName, school, stats }: Props) {
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const schoolColor = school?.primary_color ?? '#00B4D8'

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [referralsRes, sessionsRes] = await Promise.all([
          fetch('/api/counselor/referrals?status=pending').then(r => r.ok ? r.json() : { referrals: [] }),
          fetch('/api/counselor/appointments?scope=upcoming').then(r => r.ok ? r.json() : { sessions: [] }),
        ])
        if (cancelled) return

        const referralItems: ActivityItem[] = (referralsRes.referrals ?? []).slice(0, 5).map((r: any) => ({
          id: `referral-${r.id}`,
          type: 'counseling_referral',
          title: 'New referral',
          subtitle: r.student?.full_name ?? 'A student',
          href: '/dashboard/counselor/referrals',
          created_at: r.created_at,
        }))
        const sessionItems: ActivityItem[] = (sessionsRes.sessions ?? []).slice(0, 5).map((s: any) => ({
          id: `session-${s.id}`,
          type: 'counseling_appointment',
          title: 'Upcoming appointment',
          subtitle: `${s.student?.full_name ?? 'Student'} · ${new Date(s.scheduled_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}`,
          href: '/dashboard/counselor/appointments',
          created_at: s.scheduled_at,
        }))

        setActivities(
          [...referralItems, ...sessionItems].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )
        )
      } catch {
        // Non-critical widget, home screen stays usable without it.
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return (
    <div>
      <RoleHeroHeader
        userId={userId}
        role="counselor"
        roleLabel="Counselor"
        profile={{ full_name: counselorName }}
        school={school}
        greeting={`Hello, ${counselorName.split(' ')[0] || 'Counselor'}`}
        headline={`${stats.openCases + stats.monitoringCases} active case${stats.openCases + stats.monitoringCases === 1 ? '' : 's'}`}
        sub={`${stats.pendingReferrals} referral${stats.pendingReferrals === 1 ? '' : 's'} pending · ${stats.upcomingSessions} upcoming`}
        featureGroups={FEATURE_GROUPS}
      />

      <ContextSwitcher />

      <main className={styles.main}>
        <div className={motion.riseIn} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 12, marginBottom: 'var(--space-4)' }}>
          <div className="glass-card-flat" style={{ padding: 18, borderRadius: 'var(--radius-xl)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>Active caseload</p>
            <p style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>
              {stats.openCases + stats.monitoringCases}
            </p>
            <div style={{ display: 'flex', gap: 20, paddingTop: 10, marginTop: 2, borderTop: '1px solid var(--glass-border)' }}>
              <div>
                <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-muted)' }}>Open</p>
                <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>{stats.openCases}</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-muted)' }}>Monitoring</p>
                <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>{stats.monitoringCases}</p>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="glass-card-flat" style={{ padding: '12px 14px', borderRadius: 'var(--radius-lg)', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
              <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-muted)' }}>Referrals</p>
              <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: stats.pendingReferrals > 0 ? 'var(--status-warn, #E4572E)' : 'var(--text-primary)' }}>{stats.pendingReferrals}</p>
            </div>
            <div className="glass-card-flat" style={{ padding: '12px 14px', borderRadius: 'var(--radius-lg)', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
              <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-muted)' }}>Upcoming</p>
              <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>{stats.upcomingSessions}</p>
            </div>
          </div>
        </div>

        <AiInsightBanner
          insight={insightFor(stats)}
          actionLabel={stats.overdueFollowUps > 0 ? 'Review follow-ups →' : stats.pendingReferrals > 0 ? 'Review referrals →' : 'Open caseload →'}
          actionHref={stats.overdueFollowUps > 0 ? '/dashboard/counselor/cases' : stats.pendingReferrals > 0 ? '/dashboard/counselor/referrals' : '/dashboard/counselor/cases'}
        />

        <p className={styles.sectionLabel}>Quick access</p>
        <div className={styles.quickLinkRow}>
          <a href="/dashboard/counselor/cases" className={`glass-card ${motion.pressable} ${styles.quickLink}`}>
            <span className={styles.quickLinkIcon}><HeartIcon size={18} /></span>
            <span className={styles.quickLinkText}>
              <span className={styles.quickLinkLabel}>Caseload</span>
              <span className={styles.quickLinkCount}>{stats.openCases + stats.monitoringCases} active</span>
            </span>
          </a>
          <a href="/dashboard/counselor/appointments" className={`glass-card ${motion.pressable} ${styles.quickLink}`}>
            <span className={styles.quickLinkIcon}><CalendarIcon size={18} /></span>
            <span className={styles.quickLinkText}>
              <span className={styles.quickLinkLabel}>Appointments</span>
              <span className={styles.quickLinkCount}>{stats.upcomingSessions} upcoming</span>
            </span>
          </a>
          <a href="/dashboard/counselor/referrals" className={`glass-card ${motion.pressable} ${styles.quickLink}`}>
            <span className={styles.quickLinkIcon}><ShieldIcon size={18} /></span>
            <span className={styles.quickLinkText}>
              <span className={styles.quickLinkLabel}>Referrals</span>
              <span className={styles.quickLinkCount}>{stats.pendingReferrals} pending</span>
            </span>
          </a>
          <a href="/dashboard/counselor/ai" className={`glass-card ${motion.pressable} ${styles.quickLink}`}>
            <span className={styles.quickLinkIcon}><AiIcon size={18} /></span>
            <span className={styles.quickLinkText}>
              <span className={styles.quickLinkLabel}>AI Assistant</span>
              <span className={styles.quickLinkCount}>ask a question</span>
            </span>
          </a>
        </div>

        <RecentActivity
          items={activities}
          accentColor={schoolColor}
          emptyLabel="Nothing new right now. Referrals and appointments will show up here."
        />

        <div className={styles.spacer} />
      </main>

      <BottomDock aiHref="/dashboard/counselor/ai" groups={FEATURE_GROUPS} role="counselor" />
      <ChatWidget userId={userId} role="counselor" schoolColor={schoolColor} />
    </div>
  )
}
