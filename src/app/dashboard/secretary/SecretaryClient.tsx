'use client'
// src/app/dashboard/secretary/SecretaryClient.tsx

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import DashboardHeader from '@/components/DashboardHeader'
import ChatWidget from '@/components/ChatWidget'
import RoleNav from '@/components/RoleNav'
import {
  UserIcon, UsersIcon, CalendarIcon,
  MessageIcon, BellIcon, SettingsIcon, FolderIcon,
  ClipboardIcon, CheckCircleIcon, BookOpenIcon, SparklesIcon,
} from '@/components/Icons'
import styles from './secretary.module.css'

const MODULES = [
  { id: 'students',      label: 'Students',       Icon: UsersIcon,       href: '/dashboard/secretary/students',      accent: '#10B981', bg: '#1a4a3a' },
  { id: 'transfers',     label: 'Transfers',      Icon: ClipboardIcon,   href: '/dashboard/secretary/transfers',     accent: '#3B82F6', bg: '#1e3a5f' },
  { id: 'users',         label: 'Users',           Icon: UserIcon,        href: '/dashboard/secretary/users',         accent: '#8B5CF6', bg: '#2e1f5e' },
  { id: 'records',       label: 'Records',         Icon: FolderIcon,      href: '/dashboard/secretary/records',       accent: '#EC4899', bg: '#5a1a40' },
  { id: 'documents',     label: 'Documents',       Icon: BookOpenIcon,    href: '/dashboard/secretary/documents',     accent: '#06B6D4', bg: '#0a3040' },
  { id: 'notices',       label: 'Notices',         Icon: BellIcon,        href: '/dashboard/secretary/notices',       accent: '#EF4444', bg: '#5f1e1e' },
  { id: 'calendar',      label: 'Calendar',        Icon: CalendarIcon,    href: '/dashboard/secretary/calendar',      accent: '#F97316', bg: '#4a2810' },
  { id: 'codes',         label: 'Access Codes',    Icon: CheckCircleIcon, href: '/dashboard/secretary/codes',         accent: '#7C3AED', bg: '#2d1060' },
  { id: 'chat',          label: 'Messages',        Icon: MessageIcon,     href: '/dashboard/secretary/chat',          accent: '#14B8A6', bg: '#0d3330' },
  { id: 'ai',            label: 'AI Assistant',    Icon: SparklesIcon,    href: '/dashboard/secretary/ai',            accent: '#A78BFA', bg: '#2d1a5e' },
  { id: 'settings',      label: 'Settings',        Icon: SettingsIcon,    href: '/dashboard/secretary/settings',      accent: '#6B7280', bg: '#1e2a38' },
]

interface Props { profile: any; school: any; userId: string; counts?: any }

export default function SecretaryClient({ profile, school, userId, counts = {} }: Props) {
  const pathname   = usePathname()
  const schoolColor = school?.primary_color ?? '#7C3AED'
  const firstName  = profile?.full_name?.split(' ')[0] ?? 'Secretary'

  function isActive(href: string) { return pathname.startsWith(href) }

  const stats = [
    { label: 'Total Students', value: counts.totalStudents  ?? 0, color: '#10B981' },
    { label: 'Pending Transfers', value: counts.pendingApps    ?? 0, color: '#F59E0B' },
    { label: 'New This Week',  value: counts.newThisWeek    ?? 0, color: '#3B82F6' },
    { label: 'Active Users',   value: counts.activeUsers    ?? 0, color: '#8B5CF6' },
  ]

  return (
    <div className={styles.page}>
      <RoleNav userId={userId} profile={profile} school={school} role="secretary" schoolColor={schoolColor} />

      <div className={styles.content}>
        <DashboardHeader userId={userId} role="secretary" profile={profile} school={school} schoolColor={schoolColor} />

        <main className={styles.main}>
          <div className={styles.greeting}>
            <h1 className={styles.greetingName}>Hi, {firstName} 👋</h1>
            <p className={styles.greetingSub}>Secretary dashboard · {school?.name ?? 'School'}</p>
          </div>

          {/* Stats row */}
          <div className={styles.statsRow}>
            {stats.map(s => (
              <div key={s.label} className={styles.statCard}>
                <p className={styles.statVal} style={{ color: s.color }}>{s.value}</p>
                <p className={styles.statLbl}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Quick actions */}
          <div className={styles.quickRow}>
            <Link href="/dashboard/secretary/students?action=add" className={styles.quickBtn} style={{ borderColor: '#10B981', color: '#10B981' }}>
              + Add Student
            </Link>
            <Link href="/dashboard/secretary/transfers" className={styles.quickBtn} style={{ borderColor: '#3B82F6', color: '#3B82F6' }}>
              ✈️ Transfers
            </Link>
            <Link href="/dashboard/secretary/notices" className={styles.quickBtn} style={{ borderColor: '#EF4444', color: '#EF4444' }}>
              📢 Post Notice
            </Link>
          </div>

          <p className={styles.sectionLabel}>Secretary Tools</p>
          <div className={styles.moduleGrid}>
            {MODULES.map(mod => (
              <Link key={mod.id} href={mod.href}
                className={`${styles.moduleCard} ${isActive(mod.href) ? styles.moduleActive : ''}`}
                style={isActive(mod.href) ? { borderColor: mod.accent + '60' } : {}}>
                <div className={styles.modIcon} style={{ background: mod.bg }}>
                  <mod.Icon size={22} color={mod.accent} />
                </div>
                <span className={styles.modLabel}>{mod.label}</span>
              </Link>
            ))}
          </div>

          <div className={styles.spacer} />
        </main>

        <ChatWidget userId={userId} role="secretary" schoolColor={schoolColor} />
      </div>
    </div>
  )
}
