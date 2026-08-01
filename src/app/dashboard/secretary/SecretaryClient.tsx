'use client'
// src/app/dashboard/secretary/SecretaryClient.tsx

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import DashboardHeader from '@/components/DashboardHeader'
import ChatWidget from '@/components/ChatWidget'
import RoleNav from '@/components/RoleNav'
import RecentActivity, { ActivityItem } from '@/components/RecentActivity'   // ← NEW
import {
  UserIcon, UsersIcon, CalendarIcon,
  MessageIcon, BellIcon, SettingsIcon, FolderIcon,
  ClipboardIcon, CheckCircleIcon, BookOpenIcon, SparklesIcon,
  RefreshIcon, GraduationCapIcon, FileTextIcon,
} from '@/components/Icons'
import styles from './secretary.module.css'
import motion from '@/components/dashboard-motion.module.css'               // ← NEW

const MODULES = [
  { id: 'students',    label: 'Students',      Icon: UsersIcon,          href: '/dashboard/secretary/students',     accent: '#10B981', bg: '#1a4a3a' },
  { id: 'admissions',  label: 'Admissions',    Icon: GraduationCapIcon,  href: '/dashboard/secretary/admissions',   accent: '#F59E0B', bg: '#4a3510' },
  { id: 'applications',label: 'Applications',  Icon: FileTextIcon,       href: '/dashboard/secretary/applications', accent: '#EC4899', bg: '#5a1a40' },
  { id: 'transfers',   label: 'Transfers',     Icon: RefreshIcon,        href: '/dashboard/secretary/transfers',    accent: '#3B82F6', bg: '#1e3a5f' },
  { id: 'users',       label: 'Users',         Icon: UserIcon,           href: '/dashboard/secretary/users',        accent: '#8B5CF6', bg: '#2e1f5e' },
  { id: 'records',     label: 'Records',       Icon: FolderIcon,         href: '/dashboard/secretary/records',      accent: '#EC4899', bg: '#5a1a40' },
  { id: 'documents',   label: 'Documents',     Icon: BookOpenIcon,       href: '/dashboard/secretary/documents',    accent: '#06B6D4', bg: '#0a3040' },
  { id: 'notices',     label: 'Notices',       Icon: BellIcon,           href: '/dashboard/secretary/notices',      accent: '#EF4444', bg: '#5f1e1e' },
  { id: 'notifications',label:'Notifications', Icon: BellIcon,           href: '/dashboard/secretary/notifications',accent: '#3B82F6', bg: '#1e3a5f' },
  { id: 'calendar',    label: 'Calendar',      Icon: CalendarIcon,       href: '/dashboard/secretary/calendar',     accent: '#F97316', bg: '#4a2810' },
  { id: 'codes',       label: 'Access Codes',  Icon: CheckCircleIcon,    href: '/dashboard/secretary/codes',        accent: '#7C3AED', bg: '#2d1060' },
  { id: 'chat',        label: 'Messages',      Icon: MessageIcon,        href: '/dashboard/secretary/chat',         accent: '#14B8A6', bg: '#0d3330' },
  { id: 'ai',          label: 'AI Assistant',  Icon: SparklesIcon,       href: '/dashboard/secretary/ai',           accent: '#A78BFA', bg: '#2d1a5e' },
  { id: 'meetings',    label: 'Meetings',      Icon: CalendarIcon,       href: '/dashboard/secretary/meetings',     accent: '#06B6D4', bg: '#0a3040' },
  { id: 'settings',    label: 'Settings',      Icon: SettingsIcon,       href: '/dashboard/secretary/settings',     accent: '#6B7280', bg: '#1e2a38' },
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

export default function SecretaryClient({
  profile, school, userId, counts = {}, activities,
  pendingNotifications = [], unreadNotifCount = 0,
}: Props) {
  const pathname    = usePathname()
  const schoolColor = school?.primary_color ?? '#7C3AED'
  const firstName   = profile?.full_name?.split(' ')[0] ?? 'Secretary'

  const hour     = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  function isActive(href: string) { return pathname.startsWith(href) }

  const stats = [
    { label: 'Total Students',    value: counts.totalStudents ?? 0, color: '#10B981' },
    { label: 'Pending Transfers', value: counts.pendingApps   ?? 0, color: '#F59E0B' },
    { label: 'New This Week',     value: counts.newThisWeek   ?? 0, color: '#3B82F6' },
    { label: 'Active Users',      value: counts.activeUsers   ?? 0, color: '#8B5CF6' },
  ]

  // ── NEW: delete handler wired to Supabase ──────────────────────────────
  async function handleDeleteActivity(id: string) {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.from('recent_activities').delete().eq('id', id).eq('user_id', userId)
  }

  return (
    <div className={styles.page}>
      <RoleNav userId={userId} profile={profile} school={school} role="secretary" schoolColor={schoolColor} />

      <div className={styles.content}>
        <DashboardHeader userId={userId} role="secretary" profile={profile} school={school} schoolColor={schoolColor} />

        <main className={styles.main}>
          <div className={`${styles.greeting} ${motion.riseIn}`}>
            <h1 className={styles.greetingName}>{greeting}, {firstName} <span className={motion.waveEmoji}>👋</span></h1>
            <p className={styles.greetingSub}>Secretary dashboard · {school?.name ?? 'School'}</p>
          </div>

          {/* Stats row — staggered */}
          <div className={styles.statsRow}>
            {stats.map((s, i) => (
              <div
                key={s.label}
                className={`${styles.statCard} ${motion.staggerItem} ${motion.pressable}`}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <p className={styles.statVal} style={{ color: s.color }}>{s.value}</p>
                <p className={styles.statLbl}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Pending transfers alert */}
          {(counts.pendingApps ?? 0) > 0 && (
            <Link
              href="/dashboard/secretary/transfers"
              className={`${motion.riseIn} ${motion.pressable}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px',
                background: '#F59E0B15', border: '1px solid #F59E0B40',
                borderRadius: 10, marginBottom: 'var(--space-3)',
                textDecoration: 'none', color: '#F59E0B',
                fontSize: '0.82rem', fontWeight: 600,
                animationDelay: '150ms',
              }}
            >
              <span style={{ fontSize: 16 }}>⚠️</span>
              {counts.pendingApps} transfer{counts.pendingApps === 1 ? '' : 's'} pending your review
              <span style={{ marginLeft: 'auto', opacity: 0.6 }}>→</span>
            </Link>
          )}

          {/* Pending admissions alert */}
          {(counts.pendingAdmissions ?? 0) > 0 && (
            <Link
              href="/dashboard/secretary/admissions"
              className={`${motion.riseIn} ${motion.pressable}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px',
                background: '#10B98115', border: '1px solid #10B98140',
                borderRadius: 10, marginBottom: 'var(--space-5)',
                textDecoration: 'none', color: '#10B981',
                fontSize: '0.82rem', fontWeight: 600,
                animationDelay: '170ms',
              }}
            >
              <span style={{ fontSize: 16 }}>🎓</span>
              {counts.pendingAdmissions} admission{counts.pendingAdmissions === 1 ? '' : 's'} awaiting review
              <span style={{ marginLeft: 'auto', opacity: 0.6 }}>→</span>
            </Link>
          )}

          {/* AI Assistant — prominent, not buried in the module grid */}
          <Link
            href="/dashboard/secretary/ai"
            className={`${styles.aiCard} ${motion.riseIn}`}
            style={{ animationDelay: '190ms', borderColor: `${schoolColor}55` }}
          >
            <div className={styles.aiCardIcon} style={{ background: `${schoolColor}22`, color: schoolColor }}>
              <SparklesIcon size={22} color={schoolColor} />
            </div>
            <div className={styles.aiCardBody}>
              <p className={styles.aiCardTitle}>AI Assistant</p>
              <p className={styles.aiCardSub}>Ask how to create an access code, register a student, or process an admission</p>
            </div>
            <span className={styles.aiCardArrow}>→</span>
          </Link>

          {/* Pending notifications preview */}
          {pendingNotifications.length > 0 && (
            <div className={`${styles.notifCard} ${motion.riseIn}`} style={{ animationDelay: '210ms' }}>
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

          <p className={styles.sectionLabel}>Secretary Tools</p>
          <div className={styles.moduleGrid}>
            {MODULES.map((mod, i) => (
              <Link
                key={mod.id}
                href={mod.href}
                className={`${styles.moduleCard} ${motion.staggerItem} ${motion.pressable} ${isActive(mod.href) ? styles.moduleActive : ''}`}
                style={{ animationDelay: `${220 + i * 35}ms` }}
              >
                <div className={styles.modIcon} style={{ background: mod.bg }}>
                  <mod.Icon size={22} color={mod.accent} />
                </div>
                <span className={styles.modLabel}>{mod.label}</span>
              </Link>
            ))}
          </div>

          {/* NEW: Recent Activity feed */}
          <RecentActivity
            items={activities}
            accentColor={schoolColor}
            onDelete={handleDeleteActivity}
            emptyLabel="Nothing yet — student records and transfers will show up here"
          />

          <div className={styles.spacer} />
        </main>

        <ChatWidget userId={userId} role="secretary" schoolColor={schoolColor} />
      </div>
    </div>
  )
}
