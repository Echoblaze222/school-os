'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTheme } from '@/hooks/useTheme'
import {
  HomeIcon, PeopleIcon, ClipboardIcon, BarChartIcon,
  VideoIcon, BookIcon, AiIcon, MessageIcon, CalendarIcon,
  BellIcon, UserIcon, LogOutIcon, WalletIcon, FileTextIcon,
  MegaphoneIcon, ClockIcon, BookOpenIcon, AwardIcon, SchoolIcon,
  CheckCircleIcon, DownloadIcon, TrophyIcon, SunIcon, MoonIcon,
  SettingsIcon, CreditCardIcon, ShieldIcon,
} from './Icons'
import styles from './RoleNav.module.css'

// ── More drawer styles (teacher mobile) ─────────────────────
const drawerOverlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 9999,
  display: 'flex', alignItems: 'flex-end',
}
const drawerBackdropStyle: React.CSSProperties = {
  position: 'absolute', inset: 0,
  background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
}
const drawerPanelStyle: React.CSSProperties = {
  position: 'relative', zIndex: 1,
  width: '100%', maxWidth: 480, margin: '0 auto',
  background: 'var(--nav-bg)', border: '1px solid var(--nav-border)',
  borderRadius: '20px 20px 0 0', padding: '20px 20px 40px',
}

const MORE_NAV_ITEMS = [
  { href: '/dashboard/teacher/assignments',   Icon: ClipboardIcon, label: 'Assignments'   },
  { href: '/dashboard/teacher/grades',        Icon: BarChartIcon,  label: 'Grades'        },
  { href: '/dashboard/teacher/results',       Icon: BarChartIcon,  label: 'Results'       },
  { href: '/dashboard/teacher/quizzes',       Icon: AwardIcon,     label: 'Quizzes'       },
  { href: '/dashboard/teacher/submissions',   Icon: ClipboardIcon, label: 'Submissions'   },
  { href: '/dashboard/teacher/live',          Icon: VideoIcon,     label: 'Live Class'    },
  { href: '/dashboard/teacher/messages',      Icon: MessageIcon,   label: 'Messages'      },
  { href: '/dashboard/teacher/notes',         Icon: BookIcon,      label: 'Study Notes'   },
  { href: '/dashboard/teacher/timetable',     Icon: ClockIcon,     label: 'Timetable'     },
  { href: '/dashboard/teacher/syllabus',      Icon: BookOpenIcon,  label: 'Syllabus'      },
  { href: '/dashboard/teacher/announcements', Icon: MegaphoneIcon, label: 'Announcements' },
  { href: '/dashboard/teacher/notifications', Icon: BellIcon,      label: 'Notifications' },
  { href: '/dashboard/teacher/meetings',      Icon: CalendarIcon,  label: 'Meetings'      },
  { href: '/dashboard/teacher/audit',         Icon: ShieldIcon,    label: 'Audit Log'     },
  { href: '/dashboard/teacher/ai',            Icon: AiIcon,        label: 'AI Assistant'  },
  { href: '/dashboard/teacher/profile',       Icon: UserIcon,      label: 'My Profile'    },
]

const NAV: Record<string, {
  sidebar: { label: string; items: { href: string; Icon: any; label: string }[] }[]
  bottom:  { href?: string; Icon?: any; label?: string; home?: boolean; more?: boolean }[]
}> = {
  teacher: {
    sidebar: [
      { label: 'Main', items: [
        { href: '/dashboard/teacher',               Icon: HomeIcon,      label: 'Dashboard'     },
        { href: '/dashboard/teacher/ai',            Icon: AiIcon,        label: 'AI Assistant'  },
        { href: '/dashboard/teacher/chat',          Icon: MessageIcon,   label: 'Messages'      },
        { href: '/dashboard/teacher/announcements', Icon: MegaphoneIcon, label: 'Announcements' },
        { href: '/dashboard/teacher/notifications', Icon: BellIcon,      label: 'Notifications' },
      ]},
      { label: 'Teaching', items: [
        { href: '/dashboard/teacher/classes',       Icon: PeopleIcon,    label: 'My Classes'    },
        { href: '/dashboard/teacher/attendance',    Icon: CalendarIcon,  label: 'Attendance'    },
        { href: '/dashboard/teacher/assignments',   Icon: ClipboardIcon, label: 'Assignments'   },
        { href: '/dashboard/teacher/grades',        Icon: BarChartIcon,  label: 'Grades'        },
        { href: '/dashboard/teacher/results',       Icon: BarChartIcon,  label: 'Results'       },
        { href: '/dashboard/teacher/quizzes',       Icon: AwardIcon,     label: 'Quizzes'       },
        { href: '/dashboard/teacher/live',          Icon: VideoIcon,     label: 'Live Classes'  },
        { href: '/dashboard/teacher/meetings',      Icon: CalendarIcon,  label: 'Staff Meetings'},
      ]},
      { label: 'Resources', items: [
        { href: '/dashboard/teacher/notes',         Icon: BookIcon,      label: 'Study Notes'   },
        { href: '/dashboard/teacher/syllabus',      Icon: BookOpenIcon,  label: 'Syllabus'      },
        { href: '/dashboard/teacher/timetable',     Icon: ClockIcon,     label: 'Timetable'     },
        { href: '/dashboard/teacher/audit',         Icon: ShieldIcon,    label: 'Audit Log'     },
        { href: '/dashboard/teacher/profile',       Icon: UserIcon,      label: 'My Profile'    },
      ]},
    ],
    bottom: [
      { href: '/dashboard/teacher/classes',    Icon: PeopleIcon,   label: 'Classes' },
      { href: '/dashboard/teacher/attendance', Icon: CalendarIcon, label: 'Attend'  },
      { home: true },
      { href: '/dashboard/teacher/chat',       Icon: MessageIcon,  label: 'Chat'    },
      { more: true },
    ],
  },

  principal: {
    sidebar: [
      { label: 'Main', items: [
        { href: '/dashboard/principal',             Icon: HomeIcon,      label: 'Dashboard'   },
        { href: '/dashboard/principal/ai',          Icon: AiIcon,        label: 'AI Insights' },
        { href: '/dashboard/principal/chat',        Icon: MessageIcon,   label: 'Messages'    },
        { href: '/dashboard/principal/notices',     Icon: BellIcon,      label: 'Notices'     },
      ]},
      { label: 'Management', items: [
        { href: '/dashboard/principal/staff',       Icon: PeopleIcon,    label: 'Staff'       },
        { href: '/dashboard/principal/students',    Icon: SchoolIcon,    label: 'Students'    },
        { href: '/dashboard/principal/analytics',   Icon: BarChartIcon,  label: 'Analytics'   },
        { href: '/dashboard/principal/results',     Icon: BarChartIcon,  label: 'Results'     },
        { href: '/dashboard/principal/fees',        Icon: WalletIcon,    label: 'Fees'        },
        { href: '/dashboard/principal/reports',     Icon: FileTextIcon,  label: 'Reports'     },
        { href: '/dashboard/principal/profile',     Icon: UserIcon,      label: 'My Profile'  },
      ]},
    ],
    bottom: [
      { href: '/dashboard/principal/staff',     Icon: PeopleIcon,   label: 'Staff' },
      { href: '/dashboard/principal/analytics', Icon: BarChartIcon, label: 'Stats' },
      { home: true },
      { href: '/dashboard/principal/chat',      Icon: MessageIcon,  label: 'Chat'  },
      { href: '/dashboard/principal/ai',        Icon: AiIcon,       label: 'AI'    },
    ],
  },

  bursar: {
    sidebar: [
      { label: 'Main', items: [
        { href: '/dashboard/bursar',               Icon: HomeIcon,        label: 'Dashboard'     },
        { href: '/dashboard/bursar/ai',            Icon: AiIcon,          label: 'AI Assistant'  },
        { href: '/dashboard/bursar/chat',          Icon: MessageIcon,     label: 'Messages'      },
        { href: '/dashboard/bursar/notifications', Icon: BellIcon,        label: 'Notifications' },
      ]},
      { label: 'Finance', items: [
        { href: '/dashboard/bursar/fees',          Icon: WalletIcon,      label: 'Fee Records'   },
        { href: '/dashboard/bursar/record-payment',Icon: CreditCardIcon,  label: 'Record Payment'},
        { href: '/dashboard/bursar/payments',      Icon: CheckCircleIcon, label: 'Payments'      },
        { href: '/dashboard/bursar/invoices',      Icon: FileTextIcon,    label: 'Invoices'      },
        { href: '/dashboard/bursar/receipts',      Icon: ClipboardIcon,   label: 'Receipts'      },
        { href: '/dashboard/bursar/debtors',       Icon: PeopleIcon,      label: 'Debtors'       },
        { href: '/dashboard/bursar/reminders',     Icon: BellIcon,        label: 'Reminders'     },
        { href: '/dashboard/bursar/reports',       Icon: BarChartIcon,    label: 'Reports'       },
        { href: '/dashboard/bursar/history',       Icon: ClockIcon,       label: 'History'       },
        { href: '/dashboard/bursar/export',        Icon: DownloadIcon,    label: 'Export Data'   },
      ]},
      { label: 'Account', items: [
        { href: '/dashboard/bursar/profile',       Icon: UserIcon,        label: 'My Profile'    },
        { href: '/dashboard/bursar/settings',      Icon: SettingsIcon,    label: 'Settings'      },
      ]},
    ],
    bottom: [
      { href: '/dashboard/bursar/fees',     Icon: WalletIcon,   label: 'Fees'     },
      { href: '/dashboard/bursar/receipts', Icon: ClipboardIcon,label: 'Receipts' },
      { home: true },
      { href: '/dashboard/bursar/debtors',  Icon: PeopleIcon,   label: 'Debtors'  },
      { href: '/dashboard/bursar/reports',  Icon: BarChartIcon, label: 'Reports'  },
    ],
  },

  secretary: {
    sidebar: [
      { label: 'Main', items: [
        { href: '/dashboard/secretary',               Icon: HomeIcon,      label: 'Dashboard'     },
        { href: '/dashboard/secretary/chat',          Icon: MessageIcon,   label: 'Messages'      },
        { href: '/dashboard/secretary/calendar',      Icon: CalendarIcon,  label: 'Calendar'      },
        { href: '/dashboard/secretary/notifications', Icon: BellIcon,      label: 'Notifications' },
        { href: '/dashboard/secretary/ai',            Icon: AiIcon,        label: 'AI Assistant'  },
      ]},
      { label: 'Admin', items: [
        { href: '/dashboard/secretary/students',      Icon: PeopleIcon,    label: 'Students'      },
        { href: '/dashboard/secretary/admissions',    Icon: SchoolIcon,    label: 'Admissions'    },
        { href: '/dashboard/secretary/applications',  Icon: ClipboardIcon, label: 'Applications'  },
        { href: '/dashboard/secretary/users',         Icon: UserIcon,      label: 'Users'         },
        { href: '/dashboard/secretary/records',       Icon: FileTextIcon,  label: 'Records'       },
        { href: '/dashboard/secretary/documents',     Icon: FileTextIcon,  label: 'Documents'     },
        { href: '/dashboard/secretary/notices',       Icon: MegaphoneIcon, label: 'Notices'       },
        { href: '/dashboard/secretary/codes',         Icon: ShieldIcon,    label: 'Access Codes'  },
        { href: '/dashboard/secretary/settings',      Icon: SettingsIcon,  label: 'Settings'      },
        { href: '/dashboard/secretary/profile',       Icon: UserIcon,      label: 'My Profile'    },
      ]},
    ],
    bottom: [
      { href: '/dashboard/secretary/students', Icon: PeopleIcon,   label: 'Students' },
      { href: '/dashboard/secretary/records',  Icon: FileTextIcon, label: 'Records'  },
      { home: true },
      { href: '/dashboard/secretary/chat',     Icon: MessageIcon,  label: 'Chat'     },
      { href: '/dashboard/secretary/calendar', Icon: CalendarIcon, label: 'Calendar' },
    ],
  },

  parent: {
    sidebar: [
      { label: 'Main', items: [
        { href: '/dashboard/parent',             Icon: HomeIcon,      label: 'Dashboard'      },
        { href: '/dashboard/parent/chat',        Icon: MessageIcon,   label: 'Message School' },
      ]},
      { label: "Child's Progress", items: [
        { href: '/dashboard/parent/child',       Icon: UserIcon,      label: 'Child Profile'  },
        { href: '/dashboard/parent/results',     Icon: BarChartIcon,  label: 'Results'        },
        { href: '/dashboard/parent/attendance',  Icon: CalendarIcon,  label: 'Attendance'     },
        { href: '/dashboard/parent/assignments', Icon: ClipboardIcon, label: 'Assignments'    },
        { href: '/dashboard/parent/timetable',   Icon: ClockIcon,     label: 'Timetable'      },
        { href: '/dashboard/parent/leaderboard', Icon: TrophyIcon,    label: 'Leaderboard'    },
        { href: '/dashboard/parent/fees',        Icon: WalletIcon,    label: 'Fee Status'     },
        { href: '/dashboard/parent/profile',     Icon: UserIcon,      label: 'My Profile'     },
      ]},
    ],
    bottom: [
      { href: '/dashboard/parent/child',   Icon: UserIcon,     label: 'Child'   },
      { href: '/dashboard/parent/results', Icon: BarChartIcon, label: 'Results' },
      { home: true },
      { href: '/dashboard/parent/fees',    Icon: WalletIcon,   label: 'Fees'    },
      { href: '/dashboard/parent/chat',    Icon: MessageIcon,  label: 'Chat'    },
    ],
  },
}

interface Props {
  userId: string; profile: any; school: any
  role: string; schoolColor?: string
}

export default function RoleNav({ userId, profile, school, role, schoolColor = '#7C3AED' }: Props) {
  const pathname = usePathname()
  const router   = useRouter()
  const { theme, toggleTheme } = useTheme()
  const [showMore,    setShowMore]    = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const supabase = createClient()
  const config   = NAV[role]
  const homePath = `/dashboard/${role}`
  if (!config) return null

  function isActive(href: string, home?: boolean) {
    if (home || href === homePath) return pathname === homePath
    return pathname.startsWith(href)
  }

  // Unread chat badge (teacher only)
  useEffect(() => {
    if (role !== 'teacher') return
    loadUnread()
    const channel = supabase
      .channel(`unread_chat:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
      }, loadUnread)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, role])

  async function loadUnread() {
    const { count } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', school?.id)
      .neq('sender_id', userId)
      .eq('is_read', false)
    setUnreadCount(count ?? 0)
  }

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      {/* ── Desktop sidebar ──────────────────────────────── */}
      <aside className={styles.sidebar}>
        <div className={styles.header}>
          <div className={styles.badge} style={{ background: schoolColor }}>
            {school?.logo_url
              ? <img src={school.logo_url} alt="" className={styles.logo}/>
              : <span>{school?.name?.[0] ?? 'S'}</span>
            }
          </div>
          <div>
            <p className={styles.schoolName}>{school?.name ?? 'SchoolOS'}</p>
            <p className={styles.roleName} style={{ textTransform: 'capitalize' }}>{role} Portal</p>
          </div>
        </div>
        <div className={styles.divider}/>
        <nav className={styles.nav}>
          {config.sidebar.map(sec => (
            <div key={sec.label} className={styles.section}>
              <p className={styles.sectionLabel}>{sec.label}</p>
              {sec.items.map(item => {
                const active     = isActive(item.href)
                const isChatItem = item.href.endsWith('/chat')
                return (
                  <Link key={item.href} href={item.href}
                    className={`${styles.navItem} ${active ? styles.active : ''}`}
                    style={active ? { color: schoolColor } : undefined}>
                    <item.Icon size={16} color={active ? schoolColor : undefined}/>
                    <span>{item.label}</span>
                    {/* Unread badge on Messages sidebar item */}
                    {isChatItem && unreadCount > 0 && (
                      <span style={{
                        marginLeft: 'auto', background: '#EF4444', color: '#fff',
                        borderRadius: 999, fontSize: '0.6rem', fontWeight: 700,
                        padding: '1px 6px', minWidth: 18, textAlign: 'center',
                      }}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                    {active && <div className={styles.activePip} style={{ background: schoolColor }}/>}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>
        <div className={styles.divider}/>
        <div className={styles.footer}>
          <button className={styles.footerBtn} onClick={toggleTheme}>
            {theme === 'dark' ? <SunIcon size={14}/> : <MoonIcon size={14}/>}
            <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>
          <button className={`${styles.footerBtn} ${styles.logoutBtn}`} onClick={logout}>
            <LogOutIcon size={14} color="var(--danger)"/>
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* ── Mobile bottom nav ────────────────────────────── */}
      <nav className={styles.bottomNav}>
        {config.bottom.map((item, i) => {
          // Home button
          if (item.home) return (
            <Link key="home" href={homePath} className={styles.homeBtn} style={{ background: schoolColor }}>
              <HomeIcon size={20} color="white" strokeWidth={2}/>
            </Link>
          )

          // More drawer button (teacher only)
          if ((item as any).more) return (
            <button key="more" onClick={() => setShowMore(true)}
              className={styles.pill}
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
              <span style={{ fontSize: 20, lineHeight: 1 }}>⋯</span>
              <span>More</span>
            </button>
          )

          const active     = isActive(item.href!)
          const isChatItem = item.href?.endsWith('/chat')
          return (
            <Link key={item.href} href={item.href!}
              className={`${styles.pill} ${active ? styles.pillActive : ''}`}
              style={active ? { color: schoolColor } : undefined}>
              {/* Unread badge on Chat bottom item */}
              <div style={{ position: 'relative', display: 'inline-flex' }}>
                <item.Icon size={20} color={active ? schoolColor : undefined}/>
                {isChatItem && unreadCount > 0 && (
                  <span style={{
                    position: 'absolute', top: -4, right: -4,
                    background: '#EF4444', color: '#fff',
                    borderRadius: 999, fontSize: '0.5rem', fontWeight: 800,
                    padding: '1px 4px', minWidth: 14,
                    textAlign: 'center', lineHeight: '12px',
                  }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* ── More Drawer (teacher mobile) ─────────────────── */}
      {showMore && (
        <div style={drawerOverlayStyle} onClick={() => setShowMore(false)}>
          <div style={drawerBackdropStyle}/>
          <div style={drawerPanelStyle} onClick={e => e.stopPropagation()}>
            {/* Handle bar */}
            <div style={{
              width: 40, height: 4, borderRadius: 2,
              background: 'var(--glass-border)', margin: '-8px auto 16px',
            }}/>
            <p style={{
              fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12,
            }}>
              All Modules
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {MORE_NAV_ITEMS.map(item => {
                const active = isActive(item.href)
                return (
                  <Link key={item.href} href={item.href}
                    onClick={() => setShowMore(false)}
                    style={{
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', gap: 6, padding: '12px 8px',
                      background: active ? `${schoolColor}20` : 'var(--glass-bg)',
                      border: `1px solid ${active ? schoolColor + '50' : 'var(--glass-border)'}`,
                      borderRadius: 12, textDecoration: 'none',
                      color: active ? schoolColor : 'var(--text-secondary)',
                    }}>
                    <item.Icon size={20} color={active ? schoolColor : 'var(--text-muted)'}/>
                    <span style={{ fontSize: '0.6rem', fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>
                      {item.label}
                    </span>
                  </Link>
                )
              })}
            </div>
            {/* Sign out at bottom of drawer */}
            <button onClick={logout}
              style={{
                marginTop: 16, width: '100%', padding: '10px',
                background: 'var(--danger-subtle)', border: '1px solid var(--danger)',
                borderRadius: 10, color: 'var(--danger)', fontWeight: 700,
                fontSize: '0.82rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
              <LogOutIcon size={14} color="var(--danger)"/>
              Sign Out
            </button>
          </div>
        </div>
      )}
    </>
  )
}
