'use client'

import { useEffect, useState } from 'react'
import RoleHeroHeader from '@/components/RoleHeroHeader'
import AiInsightBanner from '@/components/AiInsightBanner'
import BottomDock from '@/components/BottomDock'
import RecentActivity, { ActivityItem } from '@/components/RecentActivity'
import ContextSwitcher from '@/components/ContextSwitcher'
import { NURSE_FEATURE_GROUPS as FEATURE_GROUPS } from './featureGroups'
import {
  HeartIcon, ClipboardIcon, ClockIcon, GridIcon,
} from '@/components/Icons'
import styles from './nurse.module.css'
import motion from '@/components/dashboard-motion.module.css'

interface Stats { visitsToday: number; pendingMeds: number; lowStockItems: number }
interface RecentVisit {
  id: string; reason: string; sent_home: boolean; visited_at: string
  profiles: { full_name: string } | { full_name: string }[] | null
}
interface Props {
  userId: string; nurseName: string; school: any; stats: Stats; recentVisits: RecentVisit[]
}

function studentName(p: RecentVisit['profiles']): string {
  if (!p) return 'A student'
  return Array.isArray(p) ? (p[0]?.full_name ?? 'A student') : p.full_name
}

function insightFor(stats: Stats) {
  if (stats.pendingMeds > 0) {
    return `${stats.pendingMeds} scheduled medication${stats.pendingMeds === 1 ? ' is' : 's are'} still due today.`
  }
  if (stats.lowStockItems > 0) {
    return `${stats.lowStockItems} clinic item${stats.lowStockItems === 1 ? ' is' : 's are'} running low - worth reordering soon.`
  }
  if (stats.visitsToday > 0) {
    return `${stats.visitsToday} clinic visit${stats.visitsToday === 1 ? '' : 's'} logged today.`
  }
  return 'No visits logged yet today. The clinic log is one tap away.'
}

export default function NurseDashboardClient({ userId, nurseName, school, stats, recentVisits }: Props) {
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const schoolColor = school?.primary_color ?? '#00B4D8'

  useEffect(() => {
    setActivities(recentVisits.map(v => ({
      id: `visit-${v.id}`,
      type: 'clinic_visit',
      title: v.reason,
      subtitle: `${studentName(v.profiles)} · ${v.sent_home ? 'Sent home' : 'Returned to class'}`,
      href: '/dashboard/nurse/visits',
      created_at: v.visited_at,
    })))
  }, [recentVisits])

  return (
    <div>
      <RoleHeroHeader
        userId={userId}
        role="nurse"
        roleLabel="School Nurse"
        profile={{ full_name: nurseName }}
        school={school}
        greeting={`Hello, ${nurseName.split(' ')[0] || 'Nurse'}`}
        headline={`${stats.visitsToday} clinic visit${stats.visitsToday === 1 ? '' : 's'} today`}
        sub={`${stats.pendingMeds} med${stats.pendingMeds === 1 ? '' : 's'} due · ${stats.lowStockItems} item${stats.lowStockItems === 1 ? '' : 's'} low on stock`}
        featureGroups={FEATURE_GROUPS}
      />

      <ContextSwitcher />

      <main className={styles.main}>
        <div className={motion.riseIn} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 12, marginBottom: 'var(--space-4)' }}>
          <div className="glass-card-flat" style={{ padding: 18, borderRadius: 'var(--radius-xl)', display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>Visits today</p>
            <p style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>{stats.visitsToday}</p>
            <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-muted)' }}>clinic log</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="glass-card-flat" style={{ padding: '12px 14px', borderRadius: 'var(--radius-lg)', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
              <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-muted)' }}>Meds due</p>
              <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: stats.pendingMeds > 0 ? 'var(--status-warn, #E4572E)' : 'var(--text-primary)' }}>{stats.pendingMeds}</p>
            </div>
            <div className="glass-card-flat" style={{ padding: '12px 14px', borderRadius: 'var(--radius-lg)', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
              <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-muted)' }}>Low stock</p>
              <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: stats.lowStockItems > 0 ? 'var(--status-warn, #E4572E)' : 'var(--text-primary)' }}>{stats.lowStockItems}</p>
            </div>
          </div>
        </div>

        <AiInsightBanner
          insight={insightFor(stats)}
          actionLabel={stats.pendingMeds > 0 ? 'Review medications →' : stats.lowStockItems > 0 ? 'Review inventory →' : 'Log a visit →'}
          actionHref={stats.pendingMeds > 0 ? '/dashboard/nurse/medications' : stats.lowStockItems > 0 ? '/dashboard/nurse/inventory' : '/dashboard/nurse/visits'}
        />

        <p className={styles.sectionLabel}>Quick access</p>
        <div className={styles.quickLinkRow}>
          <a href="/dashboard/nurse/visits" className={`glass-card ${motion.pressable} ${styles.quickLink}`}>
            <span className={styles.quickLinkIcon}><HeartIcon size={18} /></span>
            <span className={styles.quickLinkText}>
              <span className={styles.quickLinkLabel}>Log a Visit</span>
              <span className={styles.quickLinkCount}>{stats.visitsToday} today</span>
            </span>
          </a>
          <a href="/dashboard/nurse/health-records" className={`glass-card ${motion.pressable} ${styles.quickLink}`}>
            <span className={styles.quickLinkIcon}><ClipboardIcon size={18} /></span>
            <span className={styles.quickLinkText}>
              <span className={styles.quickLinkLabel}>Health Records</span>
              <span className={styles.quickLinkCount}>student profiles</span>
            </span>
          </a>
          <a href="/dashboard/nurse/medications" className={`glass-card ${motion.pressable} ${styles.quickLink}`}>
            <span className={styles.quickLinkIcon}><ClockIcon size={18} /></span>
            <span className={styles.quickLinkText}>
              <span className={styles.quickLinkLabel}>Medications</span>
              <span className={styles.quickLinkCount}>{stats.pendingMeds} due</span>
            </span>
          </a>
          <a href="/dashboard/nurse/inventory" className={`glass-card ${motion.pressable} ${styles.quickLink}`}>
            <span className={styles.quickLinkIcon}><GridIcon size={18} /></span>
            <span className={styles.quickLinkText}>
              <span className={styles.quickLinkLabel}>Inventory</span>
              <span className={styles.quickLinkCount}>{stats.lowStockItems} low</span>
            </span>
          </a>
        </div>

        <RecentActivity
          items={activities}
          accentColor={schoolColor}
          emptyLabel="No clinic visits logged yet. They'll show up here."
        />

        <div className={styles.spacer} />
      </main>

      <BottomDock aiHref="/dashboard/nurse/ai" groups={FEATURE_GROUPS} role="nurse" />
    </div>
  )
}
