'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import DashboardHeader from '@/components/DashboardHeader'
import ChatWidget from '@/components/ChatWidget'
import {
  HomeIcon, PeopleIcon, BarChartIcon, SchoolIcon,
  MessageIcon, BellIcon, WalletIcon, ClipboardIcon,
  SettingsIcon, AiIcon, MegaphoneIcon, VideoIcon,
  FileTextIcon, TrophyIcon, KeyIcon, UserIcon,
  LayersIcon, CalendarIcon, GlobeIcon, RefreshIcon,
  ShieldIcon,
} from '@/components/Icons'
import RoleNav from '@/components/RoleNav'
import styles from './principal.module.css'

const MODULES = [
  { id: 'staff',         label: 'Staff',          Icon: PeopleIcon,    href: '/dashboard/principal/staff',              accent: '#3B82F6', bg: '#1e3a5f' },
  { id: 'students',      label: 'Students',       Icon: SchoolIcon,    href: '/dashboard/principal/students',           accent: '#10B981', bg: '#1a4a3a' },
  { id: 'teachers',      label: 'Teachers',       Icon: UserIcon,      href: '/dashboard/principal/teachers',           accent: '#06B6D4', bg: '#0a3040' },
  { id: 'classes',       label: 'Classes',        Icon: LayersIcon,    href: '/dashboard/principal/classes',            accent: '#8B5CF6', bg: '#2e1f5e' },
  { id: 'codes',         label: 'Access Codes',   Icon: KeyIcon,       href: '/dashboard/principal/codes',              accent: '#F59E0B', bg: '#4a3510' },
  { id: 'analytics',     label: 'Analytics',      Icon: BarChartIcon,  href: '/dashboard/principal/analytics',          accent: '#8B5CF6', bg: '#2e1f5e' },
  { id: 'results',       label: 'Results',        Icon: TrophyIcon,    href: '/dashboard/principal/results',            accent: '#F59E0B', bg: '#4a3510' },
  { id: 'fees',          label: 'Fees',           Icon: WalletIcon,    href: '/dashboard/principal/fees',               accent: '#EF4444', bg: '#5f1e1e' },
  { id: 'assignments',   label: 'Assignments',    Icon: ClipboardIcon, href: '/dashboard/principal/assignments',        accent: '#06B6D4', bg: '#0a3040' },
  { id: 'live',          label: 'Live Classes',   Icon: VideoIcon,     href: '/dashboard/principal/live',               accent: '#EC4899', bg: '#5a1a40' },
  { id: 'meetings',      label: 'Meetings',       Icon: CalendarIcon,  href: '/dashboard/principal/meetings',           accent: '#10B981', bg: '#1a4a3a' },
  { id: 'announcements', label: 'Announcements',  Icon: MegaphoneIcon, href: '/dashboard/principal/announcements',      accent: '#F97316', bg: '#4a2810' },
  { id: 'notices',       label: 'Notices',        Icon: BellIcon,      href: '/dashboard/principal/notices',            accent: '#14B8A6', bg: '#0f3d38' },
  { id: 'notifications', label: 'Notifications',  Icon: BellIcon,      href: '/dashboard/principal/notifications',      accent: '#3B82F6', bg: '#1e3a5f' },
  { id: 'reports',       label: 'Reports',        Icon: FileTextIcon,  href: '/dashboard/principal/reports',            accent: '#F97316', bg: '#4a2810' },
  { id: 'subscriptions', label: 'Subscriptions',  Icon: ShieldIcon,    href: '/dashboard/principal/subscriptions',      accent: '#10B981', bg: '#1a4a3a' },
  { id: 'alumni',        label: 'Alumni',         Icon: GlobeIcon,     href: '/dashboard/principal/alumni',             accent: '#8B5CF6', bg: '#2e1f5e' },
  { id: 'transfers',     label: 'Transfers',      Icon: RefreshIcon,   href: '/dashboard/principal/transfers/pending',  accent: '#F59E0B', bg: '#4a3510' },
  { id: 'chat',          label: 'Messages',       Icon: MessageIcon,   href: '/dashboard/principal/chat',               accent: '#7C3AED', bg: '#2d1060' },
  { id: 'profile',       label: 'Profile',        Icon: UserIcon,      href: '/dashboard/principal/profile',            accent: '#6B7280', bg: '#1e2a38' },
  { id: 'ai',            label: 'AI Insights',    Icon: AiIcon,        href: '/dashboard/principal/ai',                 accent: '#F59E0B', bg: '#4a3510' },
  { id: 'settings',      label: 'Settings',       Icon: SettingsIcon,  href: '/dashboard/principal/settings',           accent: '#6B7280', bg: '#1e2a38' },
]


interface Props { profile: any; school: any; userId: string; counts?: any }

export default function PrincipalDashboardClient({ profile, school, userId, counts = {} }: Props) {
  const pathname = usePathname()
  const schoolColor = school?.primary_color ?? '#7C3AED'
  const firstName = profile?.full_name?.split(' ')[0] ?? 'Principal'

  function isActive(href: string, home?: boolean) {
    if (home) return pathname === '/dashboard/principal'
    return pathname.startsWith(href)
  }

  const stats = [
    { label: 'Students',  value: counts.studentCount  ?? 0, color: '#10B981' },
    { label: 'Teachers',  value: counts.teacherCount  ?? 0, color: '#3B82F6' },
    { label: 'Classes',   value: counts.classCount    ?? 0, color: '#8B5CF6' },
    { label: 'Avg Score', value: `${counts.avgScore   ?? 0}%`, color: '#F59E0B' },
  ]

  return (
    <div className={styles.page}>
      <DashboardHeader userId={userId} role="principal" profile={profile} school={school} schoolColor={schoolColor} />

      <main className={styles.main}>
        <div className={styles.greeting}>
          <h1 className={styles.greetingName}>Welcome, {firstName} 👋</h1>
          <p className={styles.greetingSub}>School overview at a glance</p>
        </div>

        {/* School health banner */}
        <div className={styles.healthBanner} style={{ borderColor: schoolColor }}>
          <div className={styles.healthLeft}>
            <p className={styles.healthTitle}>School Health Score</p>
            <p className={styles.healthScore} style={{ color: schoolColor }}>
              {counts.healthScore ?? 87}<span className={styles.healthMax}>/100</span>
            </p>
          </div>
          <div className={styles.healthRight}>
            <div className={styles.healthBar}>
              <div className={styles.healthFill}
                style={{ width: `${counts.healthScore ?? 87}%`, background: schoolColor }} />
            </div>
            <p className={styles.healthSub}>
              {counts.pendingActions ?? 3} actions need your attention
            </p>
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

        <p className={styles.sectionLabel}>Management Tools</p>
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
        role="principal"
        schoolColor={schoolColor}
      />

      <ChatWidget userId={userId} role="principal" schoolColor={schoolColor} />
    </div>
  )
}
