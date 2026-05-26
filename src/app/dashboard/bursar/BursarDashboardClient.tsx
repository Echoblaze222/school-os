'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import DashboardHeader from '@/components/DashboardHeader'
import ChatWidget from '@/components/ChatWidget'
import {
  HomeIcon, WalletIcon, FileTextIcon, BarChartIcon,
  MessageIcon, DownloadIcon, PeopleIcon, ClockIcon,
  CheckCircleIcon, BellIcon, SettingsIcon,
} from '@/components/Icons'
import RoleNav from '@/components/RoleNav'
import styles from './bursar.module.css'

const MODULES = [
  { id: 'fees',       label: 'Fee Records',    Icon: WalletIcon,      href: '/dashboard/bursar/fees',       accent: '#10B981', bg: '#1a4a3a' },
  { id: 'payments',  label: 'Payments',        Icon: CheckCircleIcon, href: '/dashboard/bursar/payments',   accent: '#3B82F6', bg: '#1e3a5f' },
  { id: 'receipts',  label: 'Receipts',        Icon: FileTextIcon,    href: '/dashboard/bursar/receipts',   accent: '#F59E0B', bg: '#4a3510' },
  { id: 'reports',   label: 'Reports',         Icon: BarChartIcon,    href: '/dashboard/bursar/reports',    accent: '#8B5CF6', bg: '#2e1f5e' },
  { id: 'debtors',   label: 'Debtors',         Icon: PeopleIcon,      href: '/dashboard/bursar/debtors',    accent: '#EF4444', bg: '#5f1e1e' },
  { id: 'reminders', label: 'Reminders',       Icon: BellIcon,        href: '/dashboard/bursar/reminders',  accent: '#EC4899', bg: '#5a1a40' },
  { id: 'export',    label: 'Export Data',     Icon: DownloadIcon,    href: '/dashboard/bursar/export',     accent: '#06B6D4', bg: '#0a3040' },
  { id: 'history',   label: 'History',         Icon: ClockIcon,       href: '/dashboard/bursar/history',    accent: '#F97316', bg: '#4a2810' },
  { id: 'chat',      label: 'Messages',        Icon: MessageIcon,     href: '/dashboard/bursar/chat',       accent: '#7C3AED', bg: '#2d1060' },
  { id: 'settings',  label: 'Settings',        Icon: SettingsIcon,    href: '/dashboard/bursar/settings',   accent: '#6B7280', bg: '#1e2a38' },
]

const NAV = [
  { href: '/dashboard/bursar/fees',     Icon: WalletIcon,      label: 'Fees'     },
  { href: '/dashboard/bursar/payments', Icon: CheckCircleIcon, label: 'Payments' },
  { href: '/dashboard/bursar',          home: true                                },
  { href: '/dashboard/bursar/chat',     Icon: MessageIcon,     label: 'Chat'     },
  { href: '/dashboard/bursar/reports',  Icon: BarChartIcon,    label: 'Reports'  },
]

interface Props { profile: any; school: any; userId: string; counts?: any }

export default function BursarDashboardClient({ profile, school, userId, counts = {} }: Props) {
  const pathname = usePathname()
  const schoolColor = school?.primary_color ?? '#7C3AED'
  const firstName = profile?.full_name?.split(' ')[0] ?? 'Bursar'

  function isActive(href: string, home?: boolean) {
    if (home) return pathname === '/dashboard/bursar'
    return pathname.startsWith(href)
  }

  const stats = [
    { label: 'Total Collected', value: `₦${((counts.totalCollected ?? 0) / 1000).toFixed(0)}k`, color: '#10B981' },
    { label: 'Outstanding',     value: `₦${((counts.outstanding  ?? 0) / 1000).toFixed(0)}k`, color: '#EF4444' },
    { label: 'Paid Students',   value: counts.paidCount    ?? 0,   color: '#3B82F6' },
    { label: 'Pending',         value: counts.pendingCount ?? 0,   color: '#F59E0B' },
  ]

  return (
    <div className={styles.page}>
      <DashboardHeader userId={userId} role="bursar" profile={profile} school={school} schoolColor={schoolColor} />

      <main className={styles.main}>
        <div className={styles.greeting}>
          <h1 className={styles.greetingName}>Hi, {firstName} 👋</h1>
          <p className={styles.greetingSub}>Financial overview for this term</p>
        </div>

        {/* Collection progress */}
        <div className={styles.collectionCard} style={{ borderColor: schoolColor + '40' }}>
          <div className={styles.colLeft}>
            <p className={styles.colLabel}>Term Collection</p>
            <p className={styles.colValue} style={{ color: schoolColor }}>
              {counts.collectionRate ?? 72}%
            </p>
          </div>
          <div className={styles.colRight}>
            <div className={styles.colTrack}>
              <div className={styles.colFill}
                style={{ width: `${counts.collectionRate ?? 72}%`, background: schoolColor }} />
            </div>
            <p className={styles.colSub}>of expected revenue collected</p>
          </div>
        </div>

        <div className={styles.statsRow}>
          {stats.map(s => (
            <div key={s.label} className={styles.statCard}>
              <p className={styles.statVal} style={{ color: s.color }}>{s.value}</p>
              <p className={styles.statLbl}>{s.label}</p>
            </div>
          ))}
        </div>

        <p className={styles.sectionLabel}>Finance Tools</p>
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
        items={NAV}
        homeHref="/dashboard/bursar"
        schoolColor={schoolColor}
      />

      <ChatWidget userId={userId} role="bursar" schoolColor={schoolColor} />
    </div>
  )
}
