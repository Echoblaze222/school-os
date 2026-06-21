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

const MODULE_DEFS = [
  { id: 'students',   label: 'Students',      Icon: UsersIcon,       href: '/dashboard/secretary/students'   },
  { id: 'transfers',  label: 'Transfers',     Icon: ClipboardIcon,   href: '/dashboard/secretary/transfers'  },
  { id: 'users',      label: 'Users',         Icon: UserIcon,        href: '/dashboard/secretary/users'      },
  { id: 'records',    label: 'Records',       Icon: FolderIcon,      href: '/dashboard/secretary/records'    },
  { id: 'documents',  label: 'Documents',     Icon: BookOpenIcon,    href: '/dashboard/secretary/documents'  },
  { id: 'notices',    label: 'Notices',       Icon: BellIcon,        href: '/dashboard/secretary/notices'    },
  { id: 'calendar',   label: 'Calendar',      Icon: CalendarIcon,    href: '/dashboard/secretary/calendar'   },
  { id: 'codes',      label: 'Access Codes',  Icon: CheckCircleIcon, href: '/dashboard/secretary/codes'      },
  { id: 'chat',       label: 'Messages',      Icon: MessageIcon,     href: '/dashboard/secretary/chat'       },
  { id: 'ai',         label: 'AI Assistant',  Icon: SparklesIcon,    href: '/dashboard/secretary/ai'         },
  { id: 'settings',   label: 'Settings',      Icon: SettingsIcon,    href: '/dashboard/secretary/settings'   },
]

// Each tile keeps its own distinct colour, but that colour is now generated
// FROM the school's brand colour (evenly-spaced hue rotations around it),
// instead of a fixed rainbow that's identical for every school regardless
// of their actual brand.
function hexToHsl(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0
  const l = (max + min) / 2
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return [h, s * 100, l * 100]
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360
  s /= 100; l /= 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else { r = c; g = 0; b = x }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function brandPalette(schoolColor: string, count: number) {
  const [baseH, baseS] = hexToHsl(schoolColor)
  const sat = Math.min(78, Math.max(55, baseS))
  return Array.from({ length: count }, (_, i) => {
    const hue = baseH + (360 / count) * i
    return {
      accent: hslToHex(hue, sat, 58),
      bg:     hslToHex(hue, Math.max(35, sat - 20), 18),
    }
  })
}

interface Props { profile: any; school: any; userId: string; counts?: any }

export default function SecretaryClient({ profile, school, userId, counts = {} }: Props) {
  const pathname   = usePathname()
  const schoolColor = school?.primary_color ?? '#6B7280'
  const firstName  = profile?.full_name?.split(' ')[0] ?? 'Secretary'

  const palette = brandPalette(schoolColor, MODULE_DEFS.length)
  const MODULES = MODULE_DEFS.map((m, i) => ({ ...m, ...palette[i] }))

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
  
