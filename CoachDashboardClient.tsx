'use client'

import { useEffect, useState } from 'react'
import RoleHeroHeader from '@/components/RoleHeroHeader'
import GaugeStat from '@/components/GaugeStat'
import AiInsightBanner from '@/components/AiInsightBanner'
import BottomDock from '@/components/BottomDock'
import RecentActivity, { ActivityItem } from '@/components/RecentActivity'
import ContextSwitcher from '@/components/ContextSwitcher'
import { FeatureGroup } from '@/components/AllFeaturesSheet'
import { PeopleIcon, CalendarIcon, TrophyIcon, AiIcon, MessageIcon, BellIcon, UserIcon } from '@/components/Icons'
import styles from './coach.module.css'
import motion from '@/components/dashboard-motion.module.css'

const FEATURE_GROUPS: FeatureGroup[] = [
  { name: 'Coaching', items: [
    { id: 'teams',    label: 'Teams',    href: '/dashboard/coach/teams',    Icon: PeopleIcon },
    { id: 'schedule', label: 'Schedule', href: '/dashboard/coach/schedule', Icon: CalendarIcon },
    { id: 'matches',  label: 'Matches',  href: '/dashboard/coach/matches',  Icon: TrophyIcon },
  ]},
  { name: 'Communication', items: [
    { id: 'chat',          label: 'Messages',      href: '/dashboard/coach/chat',          Icon: MessageIcon },
    { id: 'notifications', label: 'Notifications', href: '/dashboard/coach/notifications', Icon: BellIcon },
  ]},
  { name: 'Account', items: [
    { id: 'ai',      label: 'AI Assistant', href: '/dashboard/coach/ai',      Icon: AiIcon },
    { id: 'profile', label: 'My Profile',   href: '/dashboard/coach/profile', Icon: UserIcon },
  ]},
]

interface Stats { teamCount: number; totalPlayers: number; upcomingMatches: number }
interface Team { id: string; name: string; sport: string }
interface NextSession { id: string; scheduled_at: string; location: string | null; team: { name: string } | { name: string }[] | null }
interface RecentMatch {
  id: string; opponent: string; scheduled_at: string; status: string
  our_score: number | null; opponent_score: number | null
  team: { name: string } | { name: string }[] | null
}
interface Props {
  userId: string; coachName: string; school: any; stats: Stats
  teams: Team[]; nextSession: NextSession | null; recentMatches: RecentMatch[]
}

function one<T>(v: T | T[] | null): T | null { return Array.isArray(v) ? (v[0] ?? null) : v }

function insightFor(stats: Stats, nextSession: NextSession | null) {
  if (nextSession) {
    const team = one(nextSession.team)
    return `Next training: ${team?.name ?? 'your team'} on ${new Date(nextSession.scheduled_at).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'short' })}.`
  }
  if (stats.upcomingMatches > 0) {
    return `${stats.upcomingMatches} match${stats.upcomingMatches === 1 ? '' : 'es'} scheduled ahead.`
  }
  return `${stats.teamCount} team${stats.teamCount === 1 ? '' : 's'}, ${stats.totalPlayers} player${stats.totalPlayers === 1 ? '' : 's'} on your rosters.`
}

export default function CoachDashboardClient({ userId, coachName, school, stats, teams, nextSession, recentMatches }: Props) {
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const schoolColor = school?.primary_color ?? '#00B4D8'

  useEffect(() => {
    setActivities(recentMatches.map(m => {
      const team = one(m.team)
      const resultLabel = m.status === 'completed'
        ? `${m.our_score ?? 0} - ${m.opponent_score ?? 0}`
        : m.status
      return {
        id: `match-${m.id}`,
        type: 'sports_match',
        title: `vs ${m.opponent}`,
        subtitle: `${team?.name ?? 'Team'} · ${resultLabel}`,
        href: '/dashboard/coach/matches',
        created_at: m.scheduled_at,
      }
    }))
  }, [recentMatches])

  return (
    <div>
      <RoleHeroHeader
        userId={userId}
        role="coach"
        roleLabel="Coach"
        profile={{ full_name: coachName }}
        school={school}
        greeting={`Hello, Coach ${coachName.split(' ')[0] || ''}`}
        headline="Coaching Dashboard"
        sub={`${stats.teamCount} team${stats.teamCount === 1 ? '' : 's'}`}
        featureGroups={FEATURE_GROUPS}
      />

      <ContextSwitcher />

      <main className={styles.main}>
        <div className={`${motion.riseIn} ${styles.statsRow}`}>
          <div className={`glass-card ${motion.pressable} ${styles.statCard}`}>
            <GaugeStat label="Teams" value={stats.teamCount} color="var(--brand)" caption="you coach" />
          </div>
          <div className={`glass-card ${motion.pressable} ${styles.statCard}`}>
            <GaugeStat label="Players" value={stats.totalPlayers} color="var(--brand-2, var(--brand))" caption="on rosters" delayMs={80} />
          </div>
          <div className={`glass-card ${motion.pressable} ${styles.statCard}`}>
            <GaugeStat label="Matches" value={stats.upcomingMatches} color="var(--status-warn, #E4572E)" caption="upcoming" delayMs={160} />
          </div>
        </div>

        <AiInsightBanner
          insight={insightFor(stats, nextSession)}
          actionLabel={nextSession ? 'View schedule →' : stats.teamCount === 0 ? 'Create a team →' : 'View matches →'}
          actionHref={nextSession ? '/dashboard/coach/schedule' : stats.teamCount === 0 ? '/dashboard/coach/teams' : '/dashboard/coach/matches'}
        />

        <p className={styles.sectionLabel}>Quick access</p>
        <div className={styles.quickLinkRow}>
          <a href="/dashboard/coach/teams" className={`glass-card ${motion.pressable} ${styles.quickLink}`}>
            <span className={styles.quickLinkIcon}><PeopleIcon size={18} /></span>
            <span className={styles.quickLinkText}>
              <span className={styles.quickLinkLabel}>Teams</span>
              <span className={styles.quickLinkCount}>{stats.teamCount} teams</span>
            </span>
          </a>
          <a href="/dashboard/coach/schedule" className={`glass-card ${motion.pressable} ${styles.quickLink}`}>
            <span className={styles.quickLinkIcon}><CalendarIcon size={18} /></span>
            <span className={styles.quickLinkText}>
              <span className={styles.quickLinkLabel}>Schedule</span>
              <span className={styles.quickLinkCount}>training</span>
            </span>
          </a>
          <a href="/dashboard/coach/matches" className={`glass-card ${motion.pressable} ${styles.quickLink}`}>
            <span className={styles.quickLinkIcon}><TrophyIcon size={18} /></span>
            <span className={styles.quickLinkText}>
              <span className={styles.quickLinkLabel}>Matches</span>
              <span className={styles.quickLinkCount}>{stats.upcomingMatches} upcoming</span>
            </span>
          </a>
        </div>

        {teams.length > 0 && (
          <>
            <p className={styles.sectionLabel}>Your teams</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 'var(--space-4)' }}>
              {teams.map(t => (
                <a key={t.id} href="/dashboard/coach/teams" className={`glass-card ${motion.pressable}`}
                  style={{ display: 'block', padding: 12, borderRadius: 'var(--radius-lg)', textDecoration: 'none', color: 'var(--text-primary)' }}>
                  <p style={{ fontWeight: 700, fontSize: '0.84rem', margin: 0 }}>{t.name}</p>
                  <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>{t.sport}</p>
                </a>
              ))}
            </div>
          </>
        )}

        <RecentActivity items={activities} accentColor={schoolColor} emptyLabel="No matches yet. They'll show up here." />

        <div className={styles.spacer} />
      </main>

      <BottomDock aiHref="/dashboard/coach/ai" groups={FEATURE_GROUPS} role="coach" />
    </div>
  )
}
