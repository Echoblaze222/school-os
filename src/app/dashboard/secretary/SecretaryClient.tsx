'use client'
// src/app/dashboard/secretary/SecretaryClient.tsx

import Link from 'next/link'
import ChatWidget from '@/components/ChatWidget'
import RecentActivity, { ActivityItem } from '@/components/RecentActivity'
import RoleHeroHeader from '@/components/RoleHeroHeader'
import GaugeStat from '@/components/GaugeStat'
import AiInsightBanner from '@/components/AiInsightBanner'
import BottomDock from '@/components/BottomDock'
import { FeatureGroup } from '@/components/AllFeaturesSheet'
import {
  UserIcon, UsersIcon, CalendarIcon,
  MessageIcon, BellIcon, SettingsIcon, FolderIcon,
  ClipboardIcon, CheckCircleIcon, BookOpenIcon,
  RefreshIcon, GraduationCapIcon, FileTextIcon, BookIcon, ActivityIcon,
} from '@/components/Icons'
import styles from './secretary.module.css'
import motion from '@/components/dashboard-motion.module.css'

const FEATURE_GROUPS: FeatureGroup[] = [
  { name: 'Front desk', items: [
    { id: 'students',    label: 'Students',    href: '/dashboard/secretary/students',    Icon: UsersIcon },
    { id: 'admissions',  label: 'Admissions',  href: '/dashboard/secretary/admissions',  Icon: GraduationCapIcon },
    { id: 'applications',label: 'Applications',href: '/dashboard/secretary/applications',Icon: FileTextIcon },
    { id: 'transfers',   label: 'Transfers',   href: '/dashboard/secretary/transfers',   Icon: RefreshIcon },
    { id: 'clinic',      label: 'Clinic',      href: '/dashboard/secretary/clinic',      Icon: ActivityIcon },
    { id: 'codes',       label: 'Access codes',href: '/dashboard/secretary/codes',       Icon: CheckCircleIcon },
  ]},
  { name: 'Records', items: [
    { id: 'users',     label: 'Users',     href: '/dashboard/secretary/users',     Icon: UserIcon },
    { id: 'records',   label: 'Records',   href: '/dashboard/secretary/records',   Icon: FolderIcon },
    { id: 'documents', label: 'Documents', href: '/dashboard/secretary/documents', Icon: BookOpenIcon },
    { id: 'library',   label: 'Library',   href: '/dashboard/secretary/library',   Icon: BookIcon },
  ]},
  { name: 'Communication', items: [
    { id: 'notices',       label: 'Notices',  href: '/dashboard/secretary/notices',       Icon: BellIcon },
    { id: 'chat',          label: 'Messages', href: '/dashboard/secretary/chat',          Icon: MessageIcon },
    { id: 'calendar',      label: 'Calendar', href: '/dashboard/secretary/calendar',      Icon: CalendarIcon },
    { id: 'meetings',      label: 'Meetings', href: '/dashboard/secretary/meetings',      Icon: CalendarIcon },
  ]},
  { name: 'Account', items: [
    { id: 'settings', label: 'Settings', href: '/dashboard/secretary/settings', Icon: SettingsIcon },
  ]},
]

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

function buildInsight(counts: any): string {
  if ((counts.pendingAdmissions ?? 0) > 0) {
    return `${counts.pendingAdmissions} admission${counts.pendingAdmissions === 1 ? '' : 's'} still pending review, and ${counts.pendingApps ?? 0} transfer request${counts.pendingApps === 1 ? '' : 's'} waiting on the front desk.`
  }
  return `${counts.newThisWeek ?? 0} new students joined this week. Admissions and transfers are both clear right now.`
}

export default function SecretaryClient({
  profile, school, userId, counts = {}, activities,
  pendingNotifications = [], unreadNotifCount = 0,
}: Props) {
  const schoolColor = school?.primary_color ?? '#7C3AED'
  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  async function handleDeleteActivity(id: string) {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.from('recent_activities').delete().eq('id', id).eq('user_id', userId)
  }

  return (
    <div className={styles.page} style={{ background: 'color-mix(in srgb, var(--brand) 6%, var(--bg-base))' }}>
      <RoleHeroHeader
        userId={userId}
        role="secretary"
        roleLabel="Front Desk"
        profile={profile}
        school={school}
        greeting={`${greeting}, ${firstName}`}
        headline="The front desk, at a glance."
        sub={`${counts.totalStudents ?? 0} students on roll · ${counts.activeUsers ?? 0} active accounts`}
        featureGroups={FEATURE_GROUPS}
      />

      <main className={styles.main}>

        <div className={motion.riseIn} style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))', gap: 12,
          marginTop: 'var(--space-6)', marginBottom: 'var(--space-4)',
        }}>
          <div className={`glass-card ${motion.pressable}`} style={{ padding: 16, borderRadius: 'var(--radius-xl)' }}>
            <GaugeStat label="Pending admissions" value={counts.pendingAdmissions ?? 0}
              color="var(--status-warn, #E4572E)" caption="need review" />
          </div>
          <div className={`glass-card ${motion.pressable}`} style={{ padding: 16, borderRadius: 'var(--radius-xl)' }}>
            <GaugeStat label="Transfer requests" value={counts.pendingApps ?? 0}
              color="var(--status-warn, #E4572E)" caption="awaiting action" delayMs={80} />
          </div>
          <div className={`glass-card ${motion.pressable}`} style={{ padding: 16, borderRadius: 'var(--radius-xl)' }}>
            <GaugeStat label="New this week" value={counts.newThisWeek ?? 0}
              color="var(--status-ok, #3FA66B)" caption="admissions" delayMs={160} />
          </div>
        </div>

        <div style={{ marginBottom: 'var(--space-4)' }}>
          <AiInsightBanner
            insight={buildInsight(counts)}
            actionLabel="Review admissions →"
            actionHref="/dashboard/secretary/admissions"
          />
        </div>

        {pendingNotifications.length > 0 && (
          <div className={`${styles.notifCard} ${motion.riseIn}`} style={{ animationDelay: '160ms' }}>
            <div className={styles.notifCardHeader}>
              <p className={styles.sectionLabel} style={{ marginBottom: 0 }}>
                Pending Notifications {unreadNotifCount > 0 && <span className={styles.notifCountBadge}>{unreadNotifCount}</span>}
              </p>
              <Link href="/dashboard/secretary/notifications" className={styles.notifViewAll}>View All</Link>
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

        <div className={styles.statsRow} style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          {[
            { label: 'Total students', value: counts.totalStudents ?? 0 },
            { label: 'Active users',   value: counts.activeUsers   ?? 0 },
          ].map((s, i) => (
            <div
              key={s.label}
              className={`${styles.statCard} ${motion.staggerItem} ${motion.pressable}`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <p className={styles.statVal}>{s.value}</p>
              <p className={styles.statLbl}>{s.label}</p>
            </div>
          ))}
        </div>

        <RecentActivity
          items={activities}
          accentColor={schoolColor}
          onDelete={handleDeleteActivity}
          emptyLabel="Nothing yet — admissions, transfers, and clinic visits will show up here"
        />

        <div className={styles.spacer} />
      </main>

      <BottomDock homeHref="/dashboard/secretary" aiHref="/dashboard/secretary/ai" />
      <ChatWidget userId={userId} role="secretary" schoolColor={schoolColor} />
    </div>
  )
}
