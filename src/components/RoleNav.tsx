'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { signOutFlow } from '@/lib/signOutFlow'
import { useTheme } from '@/hooks/useTheme'
import {
  HomeIcon, PeopleIcon, ClipboardIcon, BarChartIcon,
  VideoIcon, BookIcon, AiIcon, MessageIcon, CalendarIcon,
  BellIcon, UserIcon, LogOutIcon, WalletIcon, FileTextIcon,
  MegaphoneIcon, ClockIcon, BookOpenIcon, AwardIcon, SchoolIcon, GraduationCapIcon,
  CheckCircleIcon, DownloadIcon, TrophyIcon, SunIcon, MoonIcon,
  SettingsIcon, CreditCardIcon, ShieldIcon, UploadIcon, ActivityIcon,
  HeartIcon, AlertCircleIcon, ArrowLeftIcon, GridIcon, RefreshIcon,
  GlobeIcon,
} from './Icons'
import styles from './RoleNav.module.css'

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
        { href: '/dashboard/teacher/clinic',        Icon: ActivityIcon,  label: 'Clinic'        },
        { href: '/dashboard/teacher/report-cards',  Icon: FileTextIcon,  label: 'Report Cards'  },
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
    // Matches the pattern already shipped for Principal/Bursar/Secretary:
    // role item / role item / home (center, raised) / role item / AI.
    bottom: [
      { href: '/dashboard/teacher/classes',    Icon: PeopleIcon,   label: 'Classes' },
      { href: '/dashboard/teacher/attendance', Icon: CalendarIcon, label: 'Attend'  },
      { home: true },
      { href: '/dashboard/teacher/chat',       Icon: MessageIcon,  label: 'Chat'    },
      { href: '/dashboard/teacher/ai',         Icon: AiIcon,       label: 'AI'      },
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
        { href: '/dashboard/principal/alumni',      Icon: AwardIcon,     label: 'Alumni'      },
        { href: '/dashboard/principal/certificates',Icon: GraduationCapIcon, label: 'Certificates'},
        { href: '/dashboard/principal/analytics',   Icon: BarChartIcon,  label: 'Analytics'   },
        { href: '/dashboard/principal/results',     Icon: BarChartIcon,  label: 'Results'     },
        { href: '/dashboard/principal/report-cards',Icon: FileTextIcon,  label: 'Report Cards'},
        { href: '/dashboard/principal/fees',        Icon: WalletIcon,    label: 'Fees'        },
        { href: '/dashboard/principal/reports',     Icon: FileTextIcon,  label: 'Reports'     },
        { href: '/dashboard/principal/promotions',  Icon: GlobeIcon,     label: 'Promotions'  },
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
        { href: '/dashboard/bursar/fees',          Icon: WalletIcon,      label: 'Fee Records'    },
        { href: '/dashboard/bursar/record-payment',Icon: CreditCardIcon,  label: 'Record Payment' },
        { href: '/dashboard/bursar/claims',        Icon: UploadIcon,      label: 'Payment Claims' },
        { href: '/dashboard/bursar/expenses',      Icon: WalletIcon,      label: 'Expenses'       },
        { href: '/dashboard/bursar/payments',      Icon: CheckCircleIcon, label: 'Payments'       },
        { href: '/dashboard/bursar/invoices',      Icon: FileTextIcon,    label: 'Invoices'       },
        { href: '/dashboard/bursar/receipts',      Icon: ClipboardIcon,   label: 'Receipts'       },
        { href: '/dashboard/bursar/debtors',       Icon: PeopleIcon,      label: 'Debtors'        },
        { href: '/dashboard/bursar/reminders',     Icon: BellIcon,        label: 'Reminders'      },
        { href: '/dashboard/bursar/reports',       Icon: BarChartIcon,    label: 'Reports'        },
        { href: '/dashboard/bursar/history',       Icon: ClockIcon,       label: 'History'        },
        { href: '/dashboard/bursar/export',        Icon: DownloadIcon,    label: 'Export Data'    },
        { href: '/dashboard/bursar/meetings',      Icon: CalendarIcon,    label: 'Meetings'       },
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

  counselor: {
    sidebar: [
      { label: 'Main', items: [
        { href: '/dashboard/counselor',               Icon: HomeIcon,      label: 'Dashboard'     },
        { href: '/dashboard/counselor/ai',             Icon: AiIcon,        label: 'AI Assistant'  },
        { href: '/dashboard/counselor/chat',           Icon: MessageIcon,   label: 'Messages'      },
        { href: '/dashboard/counselor/notifications',  Icon: BellIcon,      label: 'Notifications' },
      ]},
      { label: 'Counseling', items: [
        { href: '/dashboard/counselor/cases',          Icon: HeartIcon,     label: 'Caseload'      },
        { href: '/dashboard/counselor/appointments',   Icon: CalendarIcon,  label: 'Appointments'  },
        { href: '/dashboard/counselor/referrals',      Icon: ShieldIcon,    label: 'Referrals'     },
        { href: '/dashboard/counselor/reports',        Icon: BarChartIcon,  label: 'Reports'       },
      ]},
      { label: 'Account', items: [
        { href: '/dashboard/counselor/profile',        Icon: UserIcon,      label: 'My Profile'    },
      ]},
    ],
    bottom: [
      { href: '/dashboard/counselor/cases',        Icon: HeartIcon,    label: 'Caseload'     },
      { href: '/dashboard/counselor/appointments', Icon: CalendarIcon, label: 'Appointments' },
      { home: true },
      { href: '/dashboard/counselor/referrals',    Icon: ShieldIcon,   label: 'Referrals'    },
      { href: '/dashboard/counselor/reports',      Icon: BarChartIcon, label: 'Reports'      },
    ],
  },

  // Phase 2, Lane C, appointment-gated, not role-gated. A teacher who
  // holds an active exam-committee appointment reaches this via the
  // "Examination Team" link on their teacher dashboard; base teacher
  // functionality is completely unaffected either way. See
  // middleware.ts APPOINTMENT_DASHBOARD_SEGMENTS for the access check.
  examination: {
    sidebar: [
      { label: 'Main', items: [
        { href: '/dashboard/examination',            Icon: HomeIcon,        label: 'Committee Home' },
        { href: '/dashboard/teacher',                Icon: ArrowLeftIcon,   label: 'Teacher Dashboard' },
      ]},
      { label: 'Examinations', items: [
        { href: '/dashboard/examination/sessions',   Icon: CalendarIcon,    label: 'Exam Sessions' },
        { href: '/dashboard/examination/timetable',  Icon: ClockIcon,       label: 'Timetable'     },
        { href: '/dashboard/examination/invigilation', Icon: ShieldIcon,    label: 'Invigilation'  },
        { href: '/dashboard/examination/attendance', Icon: CheckCircleIcon, label: 'Exam Attendance' },
        { href: '/dashboard/examination/documents',  Icon: FileTextIcon,    label: 'Question Papers' },
        { href: '/dashboard/examination/incidents',  Icon: AlertCircleIcon, label: 'Incidents'     },
      ]},
      { label: 'Results', items: [
        { href: '/dashboard/examination/results',    Icon: BarChartIcon,    label: 'Verify & Publish' },
      ]},
    ],
    bottom: [
      { href: '/dashboard/examination/timetable',    Icon: ClockIcon,       label: 'Timetable' },
      { href: '/dashboard/examination/invigilation', Icon: ShieldIcon,      label: 'Duty'      },
      { home: true },
      { href: '/dashboard/examination/results',      Icon: BarChartIcon,    label: 'Results'   },
      { href: '/dashboard/examination/incidents',    Icon: AlertCircleIcon, label: 'Incidents' },
    ],
  },

  // Added for Phase 2, Lane D. 'ict' is never a profiles.role value (it's
  // an appointment, see lib/permissions.ts), but this Record is keyed by
  // plain string and RoleNav derives homePath as `/dashboard/${role}`, so
  // passing role="ict" from the ICT layout works without touching any
  // other role's config below.
  ict: {
    sidebar: [
      { label: 'Main', items: [
        { href: '/dashboard/ict',                    Icon: HomeIcon,      label: 'Dashboard'        },
        { href: '/dashboard/ict/tickets',             Icon: ClipboardIcon, label: 'Support Tickets'  },
        { href: '/dashboard/ict/assets',              Icon: ActivityIcon,  label: 'Assets'           },
        { href: '/dashboard/ict/account-requests',    Icon: UserIcon,      label: 'Account Requests' },
        { href: '/dashboard/ict/applications',        Icon: CheckCircleIcon, label: 'Applications'   },
      ]},
      { label: 'Workspace', items: [
        { href: '/dashboard/ict/chat',                Icon: MessageIcon,   label: 'Messages'      },
        { href: '/dashboard/ict/ai',                  Icon: AiIcon,        label: 'AI Assistant'  },
        { href: '/dashboard/ict/notifications',       Icon: BellIcon,      label: 'Notifications' },
        { href: '/dashboard/ict/profile',             Icon: UserIcon,      label: 'My Profile'    },
      ]},
    ],
    bottom: [
      { href: '/dashboard/ict/tickets', Icon: ClipboardIcon, label: 'Tickets' },
      { href: '/dashboard/ict/assets',  Icon: ActivityIcon,  label: 'Assets'  },
      { home: true },
      { href: '/dashboard/ict/chat',    Icon: MessageIcon,   label: 'Chat'    },
      { href: '/dashboard/ict/ai',      Icon: AiIcon,        label: 'AI'      },
    ],
  },

  nurse: {
    sidebar: [
      { label: 'Main', items: [
        { href: '/dashboard/nurse',               Icon: HomeIcon,   label: 'Dashboard'      },
        { href: '/dashboard/nurse/ai',             Icon: AiIcon,     label: 'AI Assistant'   },
        { href: '/dashboard/nurse/chat',           Icon: MessageIcon, label: 'Messages'      },
        { href: '/dashboard/nurse/notifications',  Icon: BellIcon,   label: 'Notifications'  },
      ]},
      { label: 'Clinic', items: [
        { href: '/dashboard/nurse/visits',        Icon: HeartIcon,  label: 'Clinic Visits'  },
        { href: '/dashboard/nurse/health-records', Icon: ClipboardIcon, label: 'Health Records' },
        { href: '/dashboard/nurse/medications',   Icon: ClockIcon,  label: 'Medications'    },
        { href: '/dashboard/nurse/inventory',     Icon: GridIcon,   label: 'Inventory'      },
      ]},
      { label: 'Account', items: [
        { href: '/dashboard/nurse/profile',       Icon: UserIcon,   label: 'My Profile'     },
      ]},
    ],
    bottom: [
      { href: '/dashboard/nurse/visits',   Icon: HeartIcon,     label: 'Visits'  },
      { href: '/dashboard/nurse/health-records', Icon: ClipboardIcon, label: 'Records' },
      { home: true },
      { href: '/dashboard/nurse/medications', Icon: ClockIcon,  label: 'Meds'    },
      { href: '/dashboard/nurse/ai',          Icon: AiIcon,     label: 'AI'      },
    ],
  },

  librarian: {
    sidebar: [
      { label: 'Main', items: [
        { href: '/dashboard/librarian',            Icon: HomeIcon,      label: 'Dashboard'  },
        { href: '/dashboard/librarian/ai',         Icon: AiIcon,        label: 'AI Assistant' },
        { href: '/dashboard/librarian/chat',       Icon: MessageIcon,   label: 'Messages'   },
        { href: '/dashboard/librarian/notifications', Icon: BellIcon,   label: 'Notifications' },
      ]},
      { label: 'Library', items: [
        { href: '/dashboard/librarian/catalog',    Icon: BookIcon,      label: 'Catalog'    },
        { href: '/dashboard/librarian/checkouts',  Icon: RefreshIcon,   label: 'Checkouts'  },
      ]},
      { label: 'Account', items: [
        { href: '/dashboard/librarian/profile',    Icon: UserIcon,      label: 'My Profile' },
      ]},
    ],
    bottom: [
      { href: '/dashboard/librarian/catalog',   Icon: BookIcon,    label: 'Catalog'   },
      { home: true },
      { href: '/dashboard/librarian/checkouts', Icon: RefreshIcon, label: 'Checkouts' },
      { href: '/dashboard/librarian/ai',        Icon: AiIcon,      label: 'AI'        },
    ],
  },

  coach: {
    sidebar: [
      { label: 'Main', items: [
        { href: '/dashboard/coach',           Icon: HomeIcon,     label: 'Dashboard' },
        { href: '/dashboard/coach/ai',        Icon: AiIcon,       label: 'AI Assistant' },
        { href: '/dashboard/coach/chat',      Icon: MessageIcon,  label: 'Messages'  },
        { href: '/dashboard/coach/notifications', Icon: BellIcon, label: 'Notifications' },
      ]},
      { label: 'Coaching', items: [
        { href: '/dashboard/coach/teams',     Icon: PeopleIcon,   label: 'Teams'     },
        { href: '/dashboard/coach/schedule',  Icon: CalendarIcon, label: 'Schedule'  },
        { href: '/dashboard/coach/matches',   Icon: TrophyIcon,   label: 'Matches'   },
      ]},
      { label: 'Account', items: [
        { href: '/dashboard/coach/profile',   Icon: UserIcon,     label: 'My Profile' },
      ]},
    ],
    bottom: [
      { href: '/dashboard/coach/teams',    Icon: PeopleIcon,   label: 'Teams'    },
      { href: '/dashboard/coach/schedule', Icon: CalendarIcon, label: 'Schedule' },
      { home: true },
      { href: '/dashboard/coach/matches',  Icon: TrophyIcon,   label: 'Matches'  },
      { href: '/dashboard/coach/ai',       Icon: AiIcon,       label: 'AI'       },
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
        { href: '/dashboard/secretary/transfers',     Icon: SchoolIcon,    label: 'Transfers'     },
        { href: '/dashboard/secretary/users',         Icon: UserIcon,      label: 'Users'         },
        { href: '/dashboard/secretary/records',       Icon: FileTextIcon,  label: 'Records'       },
        { href: '/dashboard/secretary/documents',     Icon: FileTextIcon,  label: 'Documents'     },
        { href: '/dashboard/secretary/library',       Icon: BookIcon,      label: 'Library'       },
        { href: '/dashboard/secretary/clinic',        Icon: ActivityIcon,  label: 'Clinic'        },
        { href: '/dashboard/secretary/notices',       Icon: MegaphoneIcon, label: 'Notices'       },
        { href: '/dashboard/secretary/codes',         Icon: ShieldIcon,    label: 'Access Codes'  },
        { href: '/dashboard/secretary/meetings',      Icon: CalendarIcon,  label: 'Meetings'      },
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
        { href: '/dashboard/parent',               Icon: HomeIcon,    label: 'Dashboard'      },
        { href: '/dashboard/parent/ai',            Icon: AiIcon,      label: 'AI Assistant'   },
        { href: '/dashboard/parent/notifications', Icon: BellIcon,    label: 'Notifications'  },
        { href: '/dashboard/parent/chat',          Icon: MessageIcon, label: 'Message School' },
      ]},
      { label: "Child's Progress", items: [
        { href: '/dashboard/parent/child',       Icon: UserIcon,      label: 'Child Profile'  },
        { href: '/dashboard/parent/results',     Icon: BarChartIcon,  label: 'Results'        },
        { href: '/dashboard/parent/attendance',  Icon: CalendarIcon,  label: 'Attendance'     },
        { href: '/dashboard/parent/library',     Icon: BookIcon,      label: 'Library'        },
        { href: '/dashboard/parent/clinic',      Icon: ActivityIcon,  label: 'Clinic'         },
        { href: '/dashboard/parent/assignments', Icon: ClipboardIcon, label: 'Assignments'    },
        { href: '/dashboard/parent/timetable',   Icon: ClockIcon,     label: 'Timetable'      },
        { href: '/dashboard/parent/leaderboard', Icon: TrophyIcon,    label: 'Leaderboard'    },
        { href: '/dashboard/parent/fees',        Icon: WalletIcon,    label: 'Fee Status'     },
        { href: '/dashboard/parent/meetings',    Icon: CalendarIcon,  label: 'Meetings'       },
        { href: '/dashboard/parent/profile',     Icon: UserIcon,      label: 'My Profile'     },
      ]},
    ],
    // Matches the pattern already shipped for Principal/Bursar/Secretary:
    // role item / role item / home (center, raised) / role item / AI.
    bottom: [
      { href: '/dashboard/parent/child',   Icon: UserIcon,     label: 'Child'   },
      { href: '/dashboard/parent/results', Icon: BarChartIcon, label: 'Results' },
      { home: true },
      { href: '/dashboard/parent/notifications', Icon: BellIcon, label: 'Alerts' },
      { href: '/dashboard/parent/ai',      Icon: AiIcon,       label: 'AI'      },
    ],
  },

  student: {
    sidebar: [
      { label: 'Main', items: [
        { href: '/dashboard/student',               Icon: HomeIcon,      label: 'Dashboard'     },
        { href: '/dashboard/student/ai',            Icon: AiIcon,        label: 'AI Tutor'      },
        { href: '/dashboard/student/chat',          Icon: MessageIcon,   label: 'Messages'      },
        { href: '/dashboard/student/announcements', Icon: MegaphoneIcon, label: 'Announcements' },
        { href: '/dashboard/student/notifications', Icon: BellIcon,      label: 'Notifications' },
      ]},
      { label: 'Academics', items: [
        { href: '/dashboard/student/classes',       Icon: PeopleIcon,    label: 'My Classes'    },
        { href: '/dashboard/student/assignments',   Icon: ClipboardIcon, label: 'Assignments'   },
        { href: '/dashboard/student/quizzes',       Icon: AwardIcon,     label: 'Quizzes'       },
        { href: '/dashboard/student/results',       Icon: BarChartIcon,  label: 'Results'       },
        { href: '/dashboard/student/records',       Icon: FileTextIcon,  label: 'Records'       },
        { href: '/dashboard/student/notes',         Icon: BookIcon,      label: 'Study Notes'   },
        { href: '/dashboard/student/syllabus',      Icon: BookOpenIcon,  label: 'Syllabus'      },
        { href: '/dashboard/student/live',          Icon: VideoIcon,     label: 'Live Classes'  },
      ]},
      { label: 'More', items: [
        { href: '/dashboard/student/timetable',     Icon: ClockIcon,     label: 'Timetable'     },
        { href: '/dashboard/student/schedule',      Icon: CalendarIcon,  label: 'Schedule'      },
        { href: '/dashboard/student/leaderboard',   Icon: TrophyIcon,    label: 'Leaderboard'   },
        { href: '/dashboard/student/library',       Icon: SchoolIcon,    label: 'Library'       },
        { href: '/dashboard/student/alumni',        Icon: AwardIcon,     label: 'Alumni'        },
        { href: '/dashboard/student/certificates',  Icon: GraduationCapIcon, label: 'Certificate'},
        { href: '/dashboard/student/meetings',      Icon: CalendarIcon,  label: 'Meetings'      },
        { href: '/dashboard/student/id-card',       Icon: CreditCardIcon,label: 'ID Card'       },
        { href: '/dashboard/student/profile',       Icon: UserIcon,      label: 'My Profile'    },
      ]},
    ],
    // Matches the pattern already shipped for the other roles:
    // role item / role item / home (center, raised) / role item / AI.
    bottom: [
      { href: '/dashboard/student/assignments', Icon: ClipboardIcon, label: 'Tasks'   },
      { href: '/dashboard/student/results',     Icon: BarChartIcon,  label: 'Results' },
      { home: true },
      { href: '/dashboard/student/chat',        Icon: MessageIcon,   label: 'Chat'    },
      { href: '/dashboard/student/ai',          Icon: AiIcon,        label: 'AI'      },
    ],
  },
}

interface Props {
  userId: string; profile: any; school: any
  role: string; schoolColor?: string
}

export default function RoleNav({ userId, profile, school, role, schoolColor = '#800020' }: Props) {
  const pathname = usePathname()
  const router   = useRouter()
  const { theme, toggleTheme } = useTheme()
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
    await signOutFlow(supabase, router)
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

    </>
  )
}
