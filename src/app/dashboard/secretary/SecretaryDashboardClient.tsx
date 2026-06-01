'use client'
// SecretaryDashboardClient.tsx
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import DashboardHeader from '@/components/DashboardHeader'
import ChatWidget from '@/components/ChatWidget'
import {
  HomeIcon, PeopleIcon, FileTextIcon, CalendarIcon,
  MessageIcon, ClipboardIcon, SettingsIcon, BellIcon,
  SchoolIcon, DownloadIcon, EditIcon, LayersIcon,
} from '@/components/Icons'
import RoleNav from '@/components/RoleNav'
import styles from './secretary.module.css'

const MODULES = [
  { id: 'admissions',   label: 'Admissions',    Icon: SchoolIcon,    href: '/dashboard/secretary/admissions',   accent: '#3B82F6', bg: '#1e3a5f' },
  { id: 'students',     label: 'Students',      Icon: PeopleIcon,    href: '/dashboard/secretary/students',     accent: '#10B981', bg: '#1a4a3a' },
  { id: 'records',      label: 'Records',       Icon: FileTextIcon,  href: '/dashboard/secretary/records',      accent: '#F59E0B', bg: '#4a3510' },
  { id: 'calendar',     label: 'Calendar',      Icon: CalendarIcon,  href: '/dashboard/secretary/calendar',     accent: '#8B5CF6', bg: '#2e1f5e' },
  { id: 'documents',    label: 'Documents',     Icon: DownloadIcon,  href: '/dashboard/secretary/documents',    accent: '#06B6D4', bg: '#0a3040' },
  { id: 'applications', label: 'Applications',  Icon: ClipboardIcon, href: '/dashboard/secretary/applications', accent: '#EC4899', bg: '#5a1a40' },
  { id: 'notices',      label: 'Notices',       Icon: BellIcon,      href: '/dashboard/secretary/notices',      accent: '#EF4444', bg: '#5f1e1e' },
  { id: 'reports',      label: 'Reports',       Icon: EditIcon,      href: '/dashboard/secretary/reports',      accent: '#F97316', bg: '#4a2810' },
  { id: 'chat',         label: 'Messages',      Icon: MessageIcon,   href: '/dashboard/secretary/chat',         accent: '#7C3AED', bg: '#2d1060' },
  { id: 'settings',     label: 'Settings',      Icon: SettingsIcon,  href: '/dashboard/secretary/settings',     accent: '#6B7280', bg: '#1e2a38' },
]

const NAV = [
  { href: '/dashboard/secretary/students',  Icon: PeopleIcon,    label: 'Students'  },
  { href: '/dashboard/secretary/records',   Icon: FileTextIcon,  label: 'Records'   },
  { href: '/dashboard/secretary',           home: true                               },
  { href: '/dashboard/secretary/chat',      Icon: MessageIcon,   label: 'Chat'      },
  { href: '/dashboard/secretary/calendar',  Icon: CalendarIcon,  label: 'Calendar'  },
]

interface Props { profile: any; school: any; userId: string; counts?: any }

export default function SecretaryDashboardClient({ profile, school, userId, counts = {} }: Props) {
  const pathname = usePathname()
  const schoolColor = school?.primary_color ?? '#7C3AED'
  const firstName = profile?.full_name?.split(' ')[0] ?? 'Secretary'

  function isActive(href: string, home?: boolean) {
    if (home) return pathname === '/dashboard/secretary'
    return pathname.startsWith(href)
  }

  const stats = [
    { label: 'Total Students', value: counts.studentCount    ?? 0,  color: '#10B981' },
    { label: 'New Admissions', value: counts.newAdmissions   ?? 0,  color: '#3B82F6' },
    { label: 'Pending Tasks',  value: counts.pendingTasks    ?? 0,  color: '#F59E0B' },
    { label: 'Documents',      value: counts.documentCount   ?? 0,  color: '#8B5CF6' },
  ]

  return (
    <div className={styles.page}>
      <DashboardHeader userId={userId} role="secretary" profile={profile} school={school} schoolColor={schoolColor} />
      <main className={styles.main}>
        <div className={styles.greeting}>
          <h1 className={styles.greetingName}>Hi, {firstName} 👋</h1>
          <p className={styles.greetingSub}>Administrative overview</p>
        </div>
        <div className={styles.statsRow}>
          {stats.map(s => (
            <div key={s.label} className={styles.statCard}>
              <p className={styles.statVal} style={{ color: s.color }}>{s.value}</p>
              <p className={styles.statLbl}>{s.label}</p>
            </div>
          ))}
        </div>
        <p className={styles.sectionLabel}>Admin Tools</p>
        <div className={styles.moduleGrid}>
          {MODULES.map(mod => (
            <Link key={mod.id} href={mod.href}
              className={`${styles.moduleCard} ${isActive(mod.href) ? styles.moduleActive : ''}`}>
              <div className={styles.modIcon} style={{ background: mod.bg }}>
                <mod.Icon size={22} color={mod.accent} />
              </div>
              <span className={styles.modLabel}>{mod.label}</span>
            </Link>
          ))}
        </div>
        <div className={styles.spacer} />
      </main>
      <RoleNav
  userId={userId}
  profile={profile}
  school={school}
  role="secretary"
  schoolColor={schoolColor}
/>
      <ChatWidget userId={userId} role="secretary" schoolColor={schoolColor} />
    </div>
  )
}
