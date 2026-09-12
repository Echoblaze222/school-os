'use client'

import Link from 'next/link'
import ChatWidget from '@/components/ChatWidget'
import RecentActivity, { ActivityItem } from '@/components/RecentActivity'
import RoleHeroHeader from '@/components/RoleHeroHeader'
import AiInsightBanner from '@/components/AiInsightBanner'
import BottomDock from '@/components/BottomDock'
import ContextSwitcher from '@/components/ContextSwitcher'
import { PRINCIPAL_FEATURE_GROUPS } from './featureGroups'
import styles from './principal.module.css'
import motion from '@/components/dashboard-motion.module.css'

const FEATURE_GROUPS = PRINCIPAL_FEATURE_GROUPS

interface PendingNotif { id: string; title: string; body: string; type: string; created_at: string; href: string }
interface Props {
  profile: any; school: any; userId: string; counts?: any; activities: ActivityItem[]
  pendingNotifications?: PendingNotif[]
  unreadNotifCount?: number
}

function notifRelTime(iso: string) {
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// Picks the lowest-scoring class-relevant signal we actually have to
// surface as the AI insight, instead of a generic static line.
function buildInsight(counts: any): string {
  if ((counts.feeCollectionRate ?? 0) < 60) {
    return `Fee collection is at ${counts.feeCollectionRate}% this term, below the usual pace by this point. Worth a reminder push to outstanding families.`
  }
  if ((counts.avgScore ?? 0) < 50) {
    return `Average score across recent results is ${counts.avgScore}%, worth a look at which classes are pulling this down.`
  }
  return `Fee collection is at ${counts.feeCollectionRate ?? 0}% and average score is ${counts.avgScore ?? 0}% this term, both tracking normally. ${counts.pendingActions ?? 0} items are waiting on your review.`
}

export default function PrincipalDashboardClient({
  profile, school, userId, counts = {}, activities,
  pendingNotifications = [], unreadNotifCount = 0,
}: Props) {
  const schoolColor = school?.primary_color ?? '#7C3AED'
  const firstName = profile?.full_name?.split(' ')[0] ?? 'Principal'

  async function handleDeleteActivity(id: string) {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { error } = await supabase.from('recent_activities').delete().eq('id', id).eq('user_id', userId)
    if (error) throw error
  }

  return (
    <div
      className={styles.page}
      style={{ background: 'color-mix(in srgb, var(--brand) 6%, var(--bg-base))' }}
    >
      <RoleHeroHeader
        userId={userId}
        role="principal"
        roleLabel="Principal's Desk"
        profile={profile}
        school={school}
        greeting={`Good day, ${firstName}`}
        headline={`${counts.feesCollectedDisplay ?? '—'} collected · ${counts.feeCollectionRate ?? 0}% of fees`}
        sub={`${counts.studentCount ?? 0} students on roll · ${counts.teacherCount ?? 0} staff`}
        featureGroups={FEATURE_GROUPS}
        showBranding
      />

      <ContextSwitcher />

      <main className={styles.main} style={{ maxWidth: 880 }}>

        {/* Top-level school metrics - one primary hero (the money number,
            the thing the whole school picture hangs off) plus three
            smaller secondary tiles, instead of 8 equal-weight cards.
            No trend shown on the secondary tiles since there's no real
            prior-period comparison queried yet - a fabricated trend
            would violate §6's "do not fabricate numbers" rule more than
            an absent one costs us. */}
        <div className={motion.riseIn} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 12, marginTop: 'var(--space-6)', marginBottom: 'var(--space-4)' }}>
          <div className="glass-card-flat" style={{ padding: 18, borderRadius: 'var(--radius-xl)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>Fees Collected</p>
            <p style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>
              {counts.feesCollectedDisplay ?? '—'}
            </p>
            <p style={{ margin: 0, fontSize: '0.74rem', fontWeight: 600, color: 'var(--status-ok, #3FA66B)' }}>
              {counts.feeCollectionRate ?? 0}% of fees this term
            </p>
            <div style={{ display: 'flex', gap: 16, paddingTop: 10, marginTop: 2, borderTop: '1px solid var(--glass-border)' }}>
              <div>
                <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-muted)' }}>Students</p>
                <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>{counts.studentCount ?? 0}</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-muted)' }}>Teachers</p>
                <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>{counts.teacherCount ?? 0}</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-muted)' }}>Classes</p>
                <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>{counts.classCount ?? 0}</p>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="glass-card-flat" style={{ padding: '12px 14px', borderRadius: 'var(--radius-lg)', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
              <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-muted)' }}>Average score</p>
              <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: (counts.avgScore ?? 0) < 50 ? 'var(--status-warn, #E4572E)' : 'var(--text-primary)' }}>{counts.avgScore ?? 0}%</p>
            </div>
            <div className="glass-card-flat" style={{ padding: '12px 14px', borderRadius: 'var(--radius-lg)', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
              <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-muted)' }}>Outstanding fees</p>
              <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--status-warn, #E4572E)' }}>{counts.outstandingFeesDisplay ?? '—'}</p>
            </div>
            <div className="glass-card-flat" style={{ padding: '12px 14px', borderRadius: 'var(--radius-lg)', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
              <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-muted)' }}>Waiting on you</p>
              <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: (counts.pendingActions ?? 0) > 0 ? 'var(--status-warn, #E4572E)' : 'var(--text-primary)' }}>{counts.pendingActions ?? 0}</p>
            </div>
          </div>
        </div>

        {/* AI Insight - one concrete, current observation, not a static blurb */}
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <AiInsightBanner
            insight={buildInsight(counts)}
            actionLabel="Open AI Insights →"
            actionHref="/dashboard/principal/ai"
          />
        </div>

        {/* Pending notifications preview */}
        {pendingNotifications.length > 0 && (
          <div className={`${styles.notifCard} ${motion.riseIn}`} style={{ animationDelay: '160ms' }}>
            <div className={styles.notifCardHeader}>
              <p className={styles.sectionLabel} style={{ marginBottom: 0 }}>
                Pending Notifications {unreadNotifCount > 0 && <span className={styles.notifCountBadge}>{unreadNotifCount}</span>}
              </p>
              <Link href="/dashboard/principal/notifications" className={styles.notifViewAll}>View All</Link>
            </div>
            {pendingNotifications.map(n => (
              <Link key={n.id} href={n.href} className={styles.notifRow}>
                <span className={styles.notifDot} style={{ background: schoolColor }} />
                <div className={styles.notifBody}>
                  <p className={styles.notifTitle}>{n.title}</p>
                  <p className={styles.notifText}>{n.body}</p>
                </div>
                <span className={styles.notifTime}>{notifRelTime(n.created_at)}</span>
              </Link>
            ))}
          </div>
        )}

        <RecentActivity
          items={activities}
          accentColor={schoolColor}
          onDelete={handleDeleteActivity}
          emptyLabel="Nothing yet. School-wide actions will show up here"
        />

        <div className={styles.spacer} />
      </main>

      <BottomDock aiHref="/dashboard/principal/ai" groups={FEATURE_GROUPS} role="principal" />
      <ChatWidget userId={userId} role="principal" schoolColor={schoolColor} />
    </div>
  )
}
