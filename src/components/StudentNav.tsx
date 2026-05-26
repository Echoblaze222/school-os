'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  HomeIcon, BookIcon, BarChartIcon, MessageIcon,
  AiIcon, BellIcon, UserIcon, SettingsIcon,
  ClipboardIcon, TrophyIcon, CalendarIcon,
  VideoIcon, ClockIcon, LogOutIcon, SchoolIcon,
  AwardIcon, MegaphoneIcon, IdCardIcon, GlobeIcon,
  FileTextIcon, BookOpenIcon, LayersIcon,
} from './Icons'
import NotificationsBell from './NotificationsBell'
import { useTheme } from '@/hooks/useTheme'
import { SunIcon, MoonIcon } from './Icons'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import styles from './StudentNav.module.css'

interface Props {
  userId:      string
  profile:     any
  school:      any
  schoolColor?: string
}

const BOTTOM_NAV = [
  { href: '/dashboard/student/notes',   Icon: BookIcon,      label: 'Learn'   },
  { href: '/dashboard/student/results', Icon: BarChartIcon,  label: 'Results' },
  { href: '/dashboard/student',         home: true                             },
  { href: '/dashboard/student/chat',    Icon: MessageIcon,   label: 'Chat'    },
  { href: '/dashboard/student/ai',      Icon: AiIcon,        label: 'AI'      },
]

const SIDEBAR_SECTIONS = [
  {
    label: 'Main',
    items: [
      { href: '/dashboard/student',             Icon: HomeIcon,      label: 'Dashboard'   },
      { href: '/dashboard/student/ai',          Icon: AiIcon,        label: 'AI Tutor'    },
      { href: '/dashboard/student/chat',        Icon: MessageIcon,   label: 'Messages'    },
      { href: '/dashboard/student/notifications',Icon: BellIcon,     label: 'Notifications'},
    ],
  },
  {
    label: 'Academics',
    items: [
      { href: '/dashboard/student/assignments', Icon: ClipboardIcon, label: 'Assignments' },
      { href: '/dashboard/student/results',     Icon: BarChartIcon,  label: 'Results'     },
      { href: '/dashboard/student/quizzes',     Icon: AwardIcon,     label: 'Quizzes'     },
      { href: '/dashboard/student/notes',       Icon: BookIcon,      label: 'Notes'       },
      { href: '/dashboard/student/syllabus',    Icon: BookOpenIcon,  label: 'Syllabus'    },
      { href: '/dashboard/student/timetable',   Icon: ClockIcon,     label: 'Timetable'   },
      { href: '/dashboard/student/classes',     Icon: VideoIcon,     label: 'Live Classes'},
      { href: '/dashboard/student/schedule',    Icon: CalendarIcon,  label: 'Study Plan'  },
    ],
  },
  {
    label: 'Personal',
    items: [
      { href: '/dashboard/student/profile',       Icon: UserIcon,      label: 'My Profile'  },
      { href: '/dashboard/student/records',       Icon: FileTextIcon,  label: 'Records'     },
      { href: '/dashboard/student/id-card',       Icon: IdCardIcon,    label: 'ID Card'     },
      { href: '/dashboard/student/leaderboard',   Icon: TrophyIcon,    label: 'Leaderboard' },
      { href: '/dashboard/student/announcements', Icon: MegaphoneIcon, label: 'Notices'     },
      { href: '/dashboard/student/alumni',        Icon: GlobeIcon,     label: 'Alumni'      },
    ],
  },
]

export default function StudentNav({ userId, profile, school, schoolColor = '#7C3AED' }: Props) {
  const pathname = usePathname()
  const router   = useRouter()
  const { theme, toggleTheme } = useTheme()

  function isActive(href: string, isHome?: boolean) {
    if (isHome) return pathname === '/dashboard/student'
    if (href === '/dashboard/student') return pathname === href
    return pathname.startsWith(href)
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const firstName = profile?.full_name?.split(' ')[0] ?? 'Student'

  return (
    <>
      {/* ── DESKTOP SIDEBAR ──────────────────────────────── */}
      <aside className={styles.sidebar}>

        {/* School branding */}
        <div className={styles.sidebarHeader}>
          <div
            className={styles.schoolBadge}
            style={{ background: schoolColor }}
          >
            {school?.logo_url
              ? <img src={school.logo_url} alt="" className={styles.schoolLogo} />
              : <span>{school?.name?.[0] ?? 'S'}</span>
            }
          </div>
          <div className={styles.schoolInfo}>
            <p className={styles.schoolName}>{school?.name ?? 'SchoolOS'}</p>
            <p className={styles.schoolRole}>Student Portal</p>
          </div>
        </div>

        <div className={styles.divider} />

        {/* Nav sections */}
        <nav className={styles.sidebarNav}>
          {SIDEBAR_SECTIONS.map(section => (
            <div key={section.label} className={styles.navSection}>
              <p className={styles.navSectionLabel}>{section.label}</p>
              {section.items.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.navItem} ${isActive(item.href) ? styles.navItemActive : ''}`}
                  style={isActive(item.href) ? { color: schoolColor } as any : undefined}
                >
                  <item.Icon
                    size={17}
                    color={isActive(item.href) ? schoolColor : undefined}
                  />
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className={styles.divider} />

        {/* Sidebar footer */}
        <div className={styles.sidebarFooter}>
          <button className={styles.themeBtn} onClick={toggleTheme}>
            {theme === 'dark' ? <SunIcon size={15} /> : <MoonIcon size={15} />}
            <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>
          <button className={styles.logoutBtn} onClick={handleLogout}>
            <LogOutIcon size={15} color="var(--danger)" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* ── MOBILE BOTTOM NAV ────────────────────────────── */}
      <nav className={styles.bottomNav}>
        {BOTTOM_NAV.map((item, i) => {
          if (item.home) {
            return (
              <Link
                key="home"
                href="/dashboard/student"
                className={styles.homeBtn}
                style={{ background: schoolColor }}
                aria-label="Home"
              >
                <HomeIcon size={20} color="#fff" strokeWidth={2} />
              </Link>
            )
          }
          const active = isActive(item.href!)
          return (
            <Link
              key={item.href}
              href={item.href!}
              className={`${styles.navPill} ${active ? styles.navPillActive : ''}`}
              style={active ? { color: schoolColor } as any : undefined}
            >
              <item.Icon! size={20} color={active ? schoolColor : undefined} />
              <span style={active ? { color: schoolColor } : undefined}>{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
