'use client'
// src/app/dashboard/vice-principal/VicePrincipalDashboardClient.tsx

import Link from 'next/link'
import RecentActivity, { ActivityItem } from '@/components/RecentActivity'
import RoleHeroHeader from '@/components/RoleHeroHeader'
import AiInsightBanner from '@/components/AiInsightBanner'
import BottomDock from '@/components/BottomDock'
import ContextSwitcher from '@/components/ContextSwitcher'
import { VP_FEATURE_GROUPS } from './featureGroups'
import type { DepartmentWithStats } from '@/lib/supabase/appointments'
import styles from './vice-principal.module.css'
import motion from '@/components/dashboard-motion.module.css'


interface PendingNotif { id: string; title: string; body: string; type: string; created_at: string; href: string }
interface Counts {
  studentCount: number; teacherCount: number; classCount: number
  avgScore: number; pendingActions: number
  myDepartmentCount: number; departmentsMissingHod: number
}
interface Props {
  profile: any; school: any; userId: string; portfolio: string | null
  counts: Counts
  myDepartments: DepartmentWithStats[]
  activities: ActivityItem[]
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

const PORTFOLIO_LABELS: Record<string, string> = {
  academics: 'Vice Principal - Academics',
  administration: 'Vice Principal - Administration',
  student_affairs: 'Vice Principal - Student Affairs',
  operations: 'Vice Principal - Operations',
}

function buildInsight(counts: Counts): string {
  if (counts.departmentsMissingHod > 0) {
    return `${counts.departmentsMissingHod} of your departments ${counts.departmentsMissingHod === 1 ? 'has' : 'have'} no Head of Department assigned yet. Assigning one gives that department a clear point of accountability.`
  }
  if (counts.avgScore > 0 && counts.avgScore < 50) {
    return `Average score across recent results is ${counts.avgScore}%. Worth a look at which departments are pulling this down.`
  }
  return `Average score across recent results is ${counts.avgScore}%. ${counts.myDepartmentCount} department${counts.myDepartmentCount === 1 ? '' : 's'} under your oversight, ${counts.pendingActions} item${counts.pendingActions === 1 ? '' : 's'} waiting on you.`
}

export default function VicePrincipalDashboardClient({
  profile, school, userId, portfolio, counts, myDepartments,
  activities, pendingNotifications = [], unreadNotifCount = 0,
}: Props) {
  const schoolColor = school?.primary_color ?? '#7C3AED'
  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'
  const roleLabel = (portfolio && PORTFOLIO_LABELS[portfolio]) ?? 'Vice Principal'

  async function handleDeleteActivity(id: string) {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.from('recent_activities').delete().eq('id', id).eq('user_id', userId)
  }

  return (
    <div className={styles.page} style={{ background: 'color-mix(in srgb, var(--brand) 6%, var(--bg-base))' }}>
      <RoleHeroHeader
        userId={userId}
        role="vice-principal"
        roleLabel={roleLabel}
        profile={profile}
        school={school}
        greeting={`Good day, ${firstName}`}
        headline={`${counts.avgScore}% average score · ${counts.myDepartmentCount} department${counts.myDepartmentCount === 1 ? '' : 's'}`}
        sub={`${counts.pendingActions} item${counts.pendingActions === 1 ? '' : 's'} waiting on you`}
        featureGroups={VP_FEATURE_GROUPS}
      />

      <ContextSwitcher />

      <main className={styles.main} style={{ maxWidth: 880 }}>

        <div className={motion.riseIn} style={{
          display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 12,
          marginTop: 'var(--space-6)', marginBottom: 'var(--space-4)',
        }}>
          <div className="glass-card-flat" style={{ padding: 18, borderRadius: 'var(--radius-xl)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>Average score</p>
            <p style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>{counts.avgScore}%</p>
            <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-muted)' }}>recent results</p>
            <div style={{ display: 'flex', gap: 20, paddingTop: 10, marginTop: 2, borderTop: '1px solid var(--glass-border)' }}>
              <div>
                <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-muted)' }}>Students</p>
                <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>{counts.studentCount ?? 0}</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-muted)' }}>Teachers</p>
                <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>{counts.teacherCount ?? 0}</p>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="glass-card-flat" style={{ padding: '12px 14px', borderRadius: 'var(--radius-lg)', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
              <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-muted)' }}>Departments</p>
              <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>{counts.myDepartmentCount}</p>
            </div>
            <div className="glass-card-flat" style={{ padding: '12px 14px', borderRadius: 'var(--radius-lg)', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
              <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-muted)' }}>Waiting on you</p>
              <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: counts.pendingActions > 0 ? 'var(--warning)' : 'var(--text-primary)' }}>{counts.pendingActions}</p>
            </div>
            <div className="glass-card-flat" style={{ padding: '12px 14px', borderRadius: 'var(--radius-lg)', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
              <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-muted)' }}>Classes</p>
              <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>{counts.classCount ?? 0}</p>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 'var(--space-4)' }}>
          <AiInsightBanner
            insight={buildInsight(counts)}
            actionLabel="Open AI Insights →"
            actionHref="/dashboard/vice-principal/ai"
          />
        </div>

        {pendingNotifications.length > 0 && (
          <div className={`${styles.notifCard} ${motion.riseIn}`} style={{ animationDelay: '160ms' }}>
            <div className={styles.notifCardHeader}>
              <p className={styles.sectionLabel} style={{ marginBottom: 0 }}>
                Pending Notifications {unreadNotifCount > 0 && <span className={styles.notifCountBadge}>{unreadNotifCount}</span>}
              </p>
              <Link href="/dashboard/vice-principal/notifications" className={styles.notifViewAll}>View All</Link>
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

        <p className={styles.sectionLabel}>Your Departments</p>
        {myDepartments.length === 0 ? (
          <div className={styles.emptyState}>
            <p>
              No departments are assigned to your Vice Principal role yet.
              Ask your Principal to configure which departments you oversee
              from Leadership &amp; Appointments - or open{' '}
              <Link href="/dashboard/vice-principal/departments" style={{ color: 'var(--brand)', fontWeight: 700 }}>
                Departments
              </Link>{' '}to view the full list.
            </p>
          </div>
        ) : (
          <div className={styles.deptGrid}>
            {myDepartments.map((d, i) => (
              <Link
                key={d.id}
                href={`/dashboard/vice-principal/departments?open=${d.id}`}
                className={`${styles.deptCard} ${motion.staggerItem} ${motion.pressable}`}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <p className={styles.deptName}>{d.name}</p>
                <p className={styles.deptMeta}>
                  {d.hod ? `HOD: ${d.hod.full_name}` : <span className={styles.deptHodMissing}>No HOD assigned</span>}
                  {' · '}{d.member_count} member{d.member_count === 1 ? '' : 's'}
                </p>
              </Link>
            ))}
          </div>
        )}

        <RecentActivity
          items={activities}
          accentColor={schoolColor}
          onDelete={handleDeleteActivity}
          emptyLabel="Nothing yet. Actions across your departments will show up here"
        />

        <div className={styles.spacer} />
      </main>

      <BottomDock aiHref="/dashboard/vice-principal/ai" groups={VP_FEATURE_GROUPS} role="vice-principal" />
    </div>
  )
}
