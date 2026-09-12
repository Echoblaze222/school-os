'use client'

import { useEffect, useState } from 'react'
import RoleHeroHeader from '@/components/RoleHeroHeader'
import AiInsightBanner from '@/components/AiInsightBanner'
import BottomDock from '@/components/BottomDock'
import RecentActivity, { ActivityItem } from '@/components/RecentActivity'
import ContextSwitcher from '@/components/ContextSwitcher'
import { COACH_FEATURE_GROUPS as FEATURE_GROUPS } from './featureGroups'
import { PeopleIcon, CalendarIcon, TrophyIcon } from '@/components/Icons'
import styles from './coach.module.css'
import motion from '@/components/dashboard-motion.module.css'

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
        headline={`${stats.totalPlayers} player${stats.totalPlayers === 1 ? '' : 's'} · ${stats.teamCount} team${stats.teamCount === 1 ? '' : 's'}`}
        sub={`${stats.upcomingMatches} match${stats.upcomingMatches === 1 ? '' : 'es'} upcoming`}
        featureGroups={FEATURE_GROUPS}
      />

      <ContextSwitcher />

      <main className={styles.main}>
        <div className={motion.riseIn} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 12, marginBottom: 'var(--space-4)' }}>
          <div className="glass-card-flat" style={{ padding: 18, borderRadius: 'var(--radius-xl)', display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>Players</p>
            <p style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>{stats.totalPlayers}</p>
            <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-muted)' }}>on your rosters</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="glass-card-flat" style={{ padding: '12px 14px', borderRadius: 'var(--radius-lg)', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
              <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-muted)' }}>Teams</p>
              <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>{stats.teamCount}</p>
            </div>
            <div className="glass-card-flat" style={{ padding: '12px 14px', borderRadius: 'var(--radius-lg)', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
              <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-muted)' }}>Matches</p>
              <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>{stats.upcomingMatches}</p>
            </div>
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
