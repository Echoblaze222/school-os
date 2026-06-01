'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useTheme } from '@/hooks/useTheme'
import {
  HomeIcon, PeopleIcon, ClipboardIcon, BarChartIcon,
  VideoIcon, BookIcon, AiIcon, MessageIcon, CalendarIcon,
  BellIcon, UserIcon, LogOutIcon, WalletIcon, FileTextIcon,
  MegaphoneIcon, ClockIcon, BookOpenIcon, AwardIcon, SchoolIcon,
  CheckCircleIcon, DownloadIcon, TrophyIcon, SunIcon, MoonIcon,
} from './Icons'
import styles from './RoleNav.module.css'

const NAV: Record<string, {
  sidebar: { label: string; items: { href: string; Icon: any; label: string }[] }[]
  bottom:  { href?: string; Icon?: any; label?: string; home?: boolean }[]
}> = {
  teacher: {
    sidebar: [
      { label:'Main', items:[
        { href:'/dashboard/teacher',               Icon:HomeIcon,      label:'Dashboard'    },
        { href:'/dashboard/teacher/ai',            Icon:AiIcon,        label:'AI Assistant' },
        { href:'/dashboard/teacher/chat',          Icon:MessageIcon,   label:'Messages'     },
        { href:'/dashboard/teacher/announcements', Icon:BellIcon,      label:'Announcements'},
      ]},
      { label:'Teaching', items:[
        { href:'/dashboard/teacher/classes',       Icon:PeopleIcon,    label:'My Classes'   },
        { href:'/dashboard/teacher/assignments',   Icon:ClipboardIcon, label:'Assignments'  },
        { href:'/dashboard/teacher/results',       Icon:BarChartIcon,  label:'Results'      },
        { href:'/dashboard/teacher/attendance',    Icon:CalendarIcon,  label:'Attendance'   },
        { href:'/dashboard/teacher/quizzes',       Icon:AwardIcon,     label:'Quizzes'      },
        { href:'/dashboard/teacher/live',          Icon:VideoIcon,     label:'Live Classes' },
      ]},
      { label:'Resources', items:[
        { href:'/dashboard/teacher/notes',         Icon:BookIcon,      label:'Notes'        },
        { href:'/dashboard/teacher/syllabus',      Icon:BookOpenIcon,  label:'Syllabus'     },
        { href:'/dashboard/teacher/timetable',     Icon:ClockIcon,     label:'Timetable'    },
        { href:'/dashboard/teacher/profile',       Icon:UserIcon,      label:'My Profile'   },
      ]},
    ],
    bottom:[
      { href:'/dashboard/teacher/classes',    Icon:PeopleIcon,    label:'Classes'  },
      { href:'/dashboard/teacher/assignments',Icon:ClipboardIcon, label:'Tasks'    },
      { home:true },
      { href:'/dashboard/teacher/chat',       Icon:MessageIcon,   label:'Chat'     },
      { href:'/dashboard/teacher/results',    Icon:BarChartIcon,  label:'Results'  },
    ],
  },
  principal: {
    sidebar:[
      { label:'Main', items:[
        { href:'/dashboard/principal',             Icon:HomeIcon,      label:'Dashboard'   },
        { href:'/dashboard/principal/ai',          Icon:AiIcon,        label:'AI Insights' },
        { href:'/dashboard/principal/chat',        Icon:MessageIcon,   label:'Messages'    },
        { href:'/dashboard/principal/notices',     Icon:BellIcon,      label:'Notices'     },
      ]},
      { label:'Management', items:[
        { href:'/dashboard/principal/staff',       Icon:PeopleIcon,    label:'Staff'       },
        { href:'/dashboard/principal/students',    Icon:SchoolIcon,    label:'Students'    },
        { href:'/dashboard/principal/analytics',   Icon:BarChartIcon,  label:'Analytics'   },
        { href:'/dashboard/principal/results',     Icon:BarChartIcon,  label:'Results'     },
        { href:'/dashboard/principal/fees',        Icon:WalletIcon,    label:'Fees'        },
        { href:'/dashboard/principal/reports',     Icon:FileTextIcon,  label:'Reports'     },
        { href:'/dashboard/principal/profile',     Icon:UserIcon,      label:'My Profile'  },
      ]},
    ],
    bottom:[
      { href:'/dashboard/principal/staff',     Icon:PeopleIcon,   label:'Staff'    },
      { href:'/dashboard/principal/analytics', Icon:BarChartIcon, label:'Stats'    },
      { home:true },
      { href:'/dashboard/principal/chat',      Icon:MessageIcon,  label:'Chat'     },
      { href:'/dashboard/principal/ai',        Icon:AiIcon,       label:'AI'       },
    ],
  },
  bursar: {
    sidebar:[
      { label:'Main', items:[
        { href:'/dashboard/bursar',              Icon:HomeIcon,        label:'Dashboard'  },
        { href:'/dashboard/bursar/chat',         Icon:MessageIcon,     label:'Messages'   },
      ]},
      { label:'Finance', items:[
        { href:'/dashboard/bursar/fees',         Icon:WalletIcon,      label:'Fee Records'},
        { href:'/dashboard/bursar/payments',     Icon:CheckCircleIcon, label:'Payments'   },
        { href:'/dashboard/bursar/receipts',     Icon:FileTextIcon,    label:'Receipts'   },
        { href:'/dashboard/bursar/debtors',      Icon:PeopleIcon,      label:'Debtors'    },
        { href:'/dashboard/bursar/reminders',    Icon:BellIcon,        label:'Reminders'  },
        { href:'/dashboard/bursar/reports',      Icon:BarChartIcon,    label:'Reports'    },
        { href:'/dashboard/bursar/export',       Icon:DownloadIcon,    label:'Export'     },
        { href:'/dashboard/bursar/profile',      Icon:UserIcon,        label:'My Profile' },
      ]},
    ],
    bottom:[
      { href:'/dashboard/bursar/fees',     Icon:WalletIcon,      label:'Fees'     },
      { href:'/dashboard/bursar/payments', Icon:CheckCircleIcon, label:'Payments' },
      { home:true },
      { href:'/dashboard/bursar/chat',     Icon:MessageIcon,     label:'Chat'     },
      { href:'/dashboard/bursar/reports',  Icon:BarChartIcon,    label:'Reports'  },
    ],
  },
  secretary: {
    sidebar:[
      { label:'Main', items:[
        { href:'/dashboard/secretary',               Icon:HomeIcon,      label:'Dashboard'    },
        { href:'/dashboard/secretary/chat',          Icon:MessageIcon,   label:'Messages'     },
        { href:'/dashboard/secretary/calendar',      Icon:CalendarIcon,  label:'Calendar'     },
      ]},
      { label:'Admin', items:[
        { href:'/dashboard/secretary/admissions',    Icon:SchoolIcon,    label:'Admissions'   },
        { href:'/dashboard/secretary/students',      Icon:PeopleIcon,    label:'Students'     },
        { href:'/dashboard/secretary/records',       Icon:FileTextIcon,  label:'Records'      },
        { href:'/dashboard/secretary/documents',     Icon:FileTextIcon,  label:'Documents'    },
        { href:'/dashboard/secretary/applications',  Icon:ClipboardIcon, label:'Applications' },
        { href:'/dashboard/secretary/notices',       Icon:MegaphoneIcon, label:'Notices'      },
        { href:'/dashboard/secretary/profile',       Icon:UserIcon,      label:'My Profile'   },
      ]},
    ],
    bottom:[
      { href:'/dashboard/secretary/students', Icon:PeopleIcon,   label:'Students' },
      { href:'/dashboard/secretary/records',  Icon:FileTextIcon, label:'Records'  },
      { home:true },
      { href:'/dashboard/secretary/chat',     Icon:MessageIcon,  label:'Chat'     },
      { href:'/dashboard/secretary/calendar', Icon:CalendarIcon, label:'Calendar' },
    ],
  },
  parent: {
    sidebar:[
      { label:'Main', items:[
        { href:'/dashboard/parent',              Icon:HomeIcon,      label:'Dashboard'      },
        { href:'/dashboard/parent/chat',         Icon:MessageIcon,   label:'Message School' },
      ]},
      { label:"Child's Progress", items:[
        { href:'/dashboard/parent/child',        Icon:UserIcon,      label:"Child Profile"  },
        { href:'/dashboard/parent/results',      Icon:BarChartIcon,  label:'Results'        },
        { href:'/dashboard/parent/attendance',   Icon:CalendarIcon,  label:'Attendance'     },
        { href:'/dashboard/parent/assignments',  Icon:ClipboardIcon, label:'Assignments'    },
        { href:'/dashboard/parent/timetable',    Icon:ClockIcon,     label:'Timetable'      },
        { href:'/dashboard/parent/leaderboard',  Icon:TrophyIcon,    label:'Leaderboard'    },
        { href:'/dashboard/parent/fees',         Icon:WalletIcon,    label:'Fee Status'     },
        { href:'/dashboard/parent/profile',      Icon:UserIcon,      label:'My Profile'     },
      ]},
    ],
    bottom:[
      { href:'/dashboard/parent/child',    Icon:UserIcon,     label:'Child'   },
      { href:'/dashboard/parent/results',  Icon:BarChartIcon, label:'Results' },
      { home:true },
      { href:'/dashboard/parent/fees',     Icon:WalletIcon,   label:'Fees'    },
      { href:'/dashboard/parent/chat',     Icon:MessageIcon,  label:'Chat'    },
    ],
  },
}

interface Props {
  userId: string; profile: any; school: any
  role: string; schoolColor?: string
}

export default function RoleNav({ userId, profile, school, role, schoolColor='#7C3AED' }: Props) {
  const pathname = usePathname()
  const router   = useRouter()
  const { theme, toggleTheme } = useTheme()
  const config   = NAV[role]
  const homePath = `/dashboard/${role}`
  if (!config) return null

  function isActive(href: string, home?: boolean) {
    if (home || href === homePath) return pathname === homePath
    return pathname.startsWith(href)
  }

  async function logout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.header}>
          <div className={styles.badge} style={{ background:schoolColor }}>
            {school?.logo_url
              ? <img src={school.logo_url} alt="" className={styles.logo}/>
              : <span>{school?.name?.[0]??'S'}</span>
            }
          </div>
          <div>
            <p className={styles.schoolName}>{school?.name??'SchoolOS'}</p>
            <p className={styles.roleName} style={{ textTransform:'capitalize' }}>{role} Portal</p>
          </div>
        </div>
        <div className={styles.divider}/>
        <nav className={styles.nav}>
          {config.sidebar.map(sec => (
            <div key={sec.label} className={styles.section}>
              <p className={styles.sectionLabel}>{sec.label}</p>
              {sec.items.map(item => {
                const active = isActive(item.href)
                return (
                  <Link key={item.href} href={item.href}
                    className={`${styles.navItem} ${active ? styles.active : ''}`}
                    style={active ? { color:schoolColor } : undefined}>
                    <item.Icon size={16} color={active ? schoolColor : undefined}/>
                    <span>{item.label}</span>
                    {active && <div className={styles.activePip} style={{ background:schoolColor }}/>}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>
        <div className={styles.divider}/>
        <div className={styles.footer}>
          <button className={styles.footerBtn} onClick={toggleTheme}>
            {theme==='dark' ? <SunIcon size={14}/> : <MoonIcon size={14}/>}
            <span>{theme==='dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>
          <button className={`${styles.footerBtn} ${styles.logoutBtn}`} onClick={logout}>
            <LogOutIcon size={14} color="var(--danger)"/>
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className={styles.bottomNav}>
        {config.bottom.map((item, i) => {
          if (item.home) return (
            <Link key="home" href={homePath} className={styles.homeBtn} style={{ background:schoolColor }}>
              <HomeIcon size={20} color="white" strokeWidth={2}/>
            </Link>
          )
          const active = isActive(item.href!)
          return (
            <Link key={item.href} href={item.href!}
              className={`${styles.pill} ${active ? styles.pillActive : ''}`}
              style={active ? { color:schoolColor } : undefined}>
              <item.Icon size={20} color={active ? schoolColor : undefined}/>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}