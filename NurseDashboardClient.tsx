'use client'

import { useEffect, useState } from 'react'
import RoleHeroHeader from '@/components/RoleHeroHeader'
import GaugeStat from '@/components/GaugeStat'
import AiInsightBanner from '@/components/AiInsightBanner'
import BottomDock from '@/components/BottomDock'
import RecentActivity, { ActivityItem } from '@/components/RecentActivity'
import ContextSwitcher from '@/components/ContextSwitcher'
import { FeatureGroup } from '@/components/AllFeaturesSheet'
import {
  HeartIcon, ClipboardIcon, ClockIcon, GridIcon, AiIcon, MessageIcon, BellIcon, UserIcon,
} from '@/components/Icons'
import styles from './nurse.module.css'
import motion from '@/components/dashboard-motion.module.css'

const FEATURE_GROUPS: FeatureGroup[] = [
  { name: 'Clinic', items: [
    { id: 'visits',        label: 'Clinic Visits',   href: '/dashboard/nurse/visits',        Icon: HeartIcon },
    { id: 'health-records', label: 'Health Records', href: '/dashboard/nurse/health-records', Icon: ClipboardIcon },
    { id: 'medications',   label: 'Medications',     href: '/dashboard/nurse/medications',    Icon: ClockIcon },
    { id: 'inventory',     label: 'Inventory',       href: '/dashboard/nurse/inventory',      Icon: GridIcon },
  ]},
  { name: 'Communication', items: [
    { id: 'chat',          label: 'Messages',      href: '/dashboard/nurse/chat',          Icon: MessageIcon },
    { id: 'notifications', label: 'Notifications', href: '/dashboard/nurse/notifications', Icon: BellIcon },
  ]},
  { name: 'Account', items: [
    { id: 'ai',      label: 'AI Assistant', href: '/dashboard/nurse/ai',      Icon: AiIcon },
    { id: 'profile', label: 'My Profile',   href: '/dashboard/nurse/profile', Icon: UserIcon },
  ]},
]

interface Stats { visitsToday: number; pendingMeds: number; lowStockItems: number }
interface RecentVisit {
  id: string; reason: string; outcome: string; visited_at: string
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
      subtitle: `${studentName(v.profiles)} · ${v.outcome.replace(/_/g, ' ')}`,
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
        headline="Clinic Dashboard"
        sub={`${stats.visitsToday} visit${stats.visitsToday === 1 ? '' : 's'} today`}
        featureGroups={FEATURE_GROUPS}
      />

      <ContextSwitcher />

      <main className={styles.main}>
        <div className={`${motion.riseIn} ${styles.statsRow}`}>
          <div className={`glass-card ${motion.pressable} ${styles.statCard}`}>
            <GaugeStat label="Visits today" value={stats.visitsToday}
              color="var(--brand)" caption="clinic log" />
          </div>
          <div className={`glass-card ${motion.pressable} ${styles.statCard}`}>
            <GaugeStat label="Meds due" value={stats.pendingMeds}
              color="var(--status-warn, #E4572E)" caption="pending today" delayMs={80} />
          </div>
          <div className={`glass-card ${motion.pressable} ${styles.statCard}`}>
            <GaugeStat label="Low stock" value={stats.lowStockItems}
              color="var(--status-warn, #E4572E)" caption="items to reorder" delayMs={160} />
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
