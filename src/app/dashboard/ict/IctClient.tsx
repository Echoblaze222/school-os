'use client'
// src/app/dashboard/ict/IctClient.tsx

import Link from 'next/link'
import RoleHeroHeader from '@/components/RoleHeroHeader'
import GaugeStat from '@/components/GaugeStat'
import AiInsightBanner from '@/components/AiInsightBanner'
import BottomDock from '@/components/BottomDock'
import ContextSwitcher from '@/components/ContextSwitcher'
import { FeatureGroup } from '@/components/AllFeaturesSheet'
import {
  ClipboardIcon, ActivityIcon, UserIcon, CheckCircleIcon,
  MessageIcon, BellIcon, SettingsIcon, AiIcon,
} from '@/components/Icons'
import styles from './ict.module.css'
import motion from '@/components/dashboard-motion.module.css'

const FEATURE_GROUPS: FeatureGroup[] = [
  { name: 'Support', items: [
    { id: 'tickets',  label: 'Tickets',           href: '/dashboard/ict/tickets',          Icon: ClipboardIcon },
    { id: 'accounts', label: 'Account Requests',  href: '/dashboard/ict/account-requests',  Icon: UserIcon },
  ]},
  { name: 'Infrastructure', items: [
    { id: 'assets', label: 'Assets & Devices', href: '/dashboard/ict/assets', Icon: ActivityIcon },
  ]},
  { name: 'Onboarding', items: [
    { id: 'applications', label: 'Applications', href: '/dashboard/ict/applications', Icon: CheckCircleIcon },
  ]},
  { name: 'Communication', items: [
    { id: 'chat',          label: 'Messages',      href: '/dashboard/ict/chat',          Icon: MessageIcon },
    { id: 'notifications', label: 'Notifications', href: '/dashboard/ict/notifications', Icon: BellIcon },
  ]},
  { name: 'Account', items: [
    { id: 'settings', label: 'Settings', href: '/dashboard/ict/settings', Icon: SettingsIcon },
  ]},
]

const PRIORITY_COLOR: Record<string, string> = {
  urgent: '#D64545', high: '#E4572E', normal: '#E0A94E', low: '#3FA66B',
}

interface Props {
  profile: any; school: any; userId: string
  appointment: 'ict_officer' | 'ict_administrator' | 'principal'
  counts: {
    openTickets: number; urgentTickets: number; assetsUnderRepair: number
    openAccountRequests: number; pendingApplications: number
  }
  recentTickets: any[]
}

function buildInsight(counts: Props['counts']): string {
  if (counts.urgentTickets > 0) {
    return `${counts.urgentTickets} urgent ticket${counts.urgentTickets === 1 ? ' needs' : 's need'} attention out of ${counts.openTickets} open right now.`
  }
  if (counts.pendingApplications > 0) {
    return `${counts.pendingApplications} access-code application${counts.pendingApplications === 1 ? ' is' : 's are'} waiting on review.`
  }
  return `${counts.openTickets} open ticket${counts.openTickets === 1 ? '' : 's'}, nothing urgent right now.`
}

export default function IctClient({ profile, school, userId, appointment, counts, recentTickets }: Props) {
  const schoolColor = school?.primary_color ?? '#800020'
  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const roleLabel = appointment === 'ict_administrator' ? 'ICT Administrator'
    : appointment === 'principal' ? 'ICT (Principal view)' : 'ICT Officer'

  return (
    <div className={styles.page} style={{ background: 'color-mix(in srgb, var(--brand) 6%, var(--bg-base))' }}>
      <RoleHeroHeader
        userId={userId}
        role="ict"
        roleLabel={roleLabel}
        profile={profile}
        school={school}
        greeting={`${greeting}, ${firstName}`}
        headline="Systems, devices, and support, all in one place."
        sub={`${counts.openTickets} open ticket${counts.openTickets === 1 ? '' : 's'} · ${counts.assetsUnderRepair} device${counts.assetsUnderRepair === 1 ? '' : 's'} under repair`}
        featureGroups={FEATURE_GROUPS}
      />

      <ContextSwitcher />

      <main className={styles.main}>
        <div className={motion.riseIn} style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))', gap: 12,
          marginTop: 'var(--space-6)', marginBottom: 'var(--space-4)',
        }}>
          <div className={`glass-card ${motion.pressable}`} style={{ padding: 16, borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
            <GaugeStat label="Open tickets" value={counts.openTickets}
              color={counts.urgentTickets > 0 ? 'var(--status-warn, #E4572E)' : 'var(--status-ok, #3FA66B)'}
              caption="need attention" />
          </div>
          <div className={`glass-card ${motion.pressable}`} style={{ padding: 16, borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
            <GaugeStat label="Under repair" value={counts.assetsUnderRepair}
              color="var(--status-warn, #E4572E)" caption="devices" delayMs={80} />
          </div>
          <div className={`glass-card ${motion.pressable}`} style={{ padding: 16, borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
            <GaugeStat label="Account requests" value={counts.openAccountRequests}
              color="var(--status-ok, #3FA66B)" caption="open" delayMs={160} />
          </div>
        </div>

        <div style={{ marginBottom: 'var(--space-4)' }}>
          <AiInsightBanner
            insight={buildInsight(counts)}
            actionLabel="Review tickets →"
            actionHref="/dashboard/ict/tickets"
          />
        </div>

        {counts.pendingApplications > 0 && (
          <Link href="/dashboard/ict/applications" className={motion.riseIn} style={{
            display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit',
            padding: 'var(--space-4)', marginBottom: 'var(--space-4)', borderRadius: 'var(--radius-lg)',
            background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
          }}>
            <CheckCircleIcon size={18} />
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700 }}>
                {counts.pendingApplications} application{counts.pendingApplications === 1 ? '' : 's'} waiting on review
              </p>
              <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Verify identity, then generate an access code
              </p>
            </div>
          </Link>
        )}

        <p className={styles.sectionLabel}>Recent Tickets</p>
        {recentTickets.length === 0 ? (
          <div className={`glass-card ${styles.emptyState}`}>
            <ClipboardIcon size={28} />
            <p>No tickets yet. New reports from staff and students will show up here.</p>
          </div>
        ) : (
          <div className={`glass-card ${motion.riseIn}`} style={{ padding: '4px 12px', borderRadius: 'var(--radius-xl)' }}>
            {recentTickets.map((t: any) => (
              <Link key={t.id} href={`/dashboard/ict/tickets`} className={styles.ticketRow}>
                <span className={styles.ticketDot} style={{ background: PRIORITY_COLOR[t.priority] ?? PRIORITY_COLOR.normal }} />
                <div className={styles.ticketBody}>
                  <p className={styles.ticketTitle}>{t.category.replace('_', ' ')}</p>
                  <p className={styles.ticketText}>{t.profiles?.full_name ?? 'Unknown'}, {t.description}</p>
                </div>
                <span className={styles.ticketMeta}>{t.status.replace('_', ' ')}</span>
              </Link>
            ))}
          </div>
        )}
      </main>

      <BottomDock role="ict" aiHref="/dashboard/ict/ai" groups={FEATURE_GROUPS} />
    </div>
  )
}
