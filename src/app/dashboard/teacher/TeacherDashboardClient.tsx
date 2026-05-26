'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import DashboardHeader from '@/components/DashboardHeader'
import ChatWidget from '@/components/ChatWidget'
import {
  HomeIcon, PeopleIcon, ClipboardIcon, BarChartIcon,
  VideoIcon, BookIcon, BellIcon, CalendarIcon,
  AwardIcon, MessageIcon, BookOpenIcon, ClockIcon,
  AiIcon, MegaphoneIcon,
} from '@/components/Icons'
import RoleNav from '@/components/RoleNav'
import styles from './teacher.module.css'

const MODULES = [
  { id: 'classes',       label: 'My Classes',    Icon: PeopleIcon,    href: '/dashboard/teacher/classes',      accent: '#3B82F6', bg: '#1e3a5f' },
  { id: 'assignments',   label: 'Assignments',    Icon: ClipboardIcon, href: '/dashboard/teacher/assignments',   accent: '#F59E0B', bg: '#4a3510' },
  { id: 'results',       label: 'Results',        Icon: BarChartIcon,  href: '/dashboard/teacher/results',       accent: '#10B981', bg: '#1a4a3a' },
  { id: 'live',          label: 'Live Class',     Icon: VideoIcon,     href: '/dashboard/teacher/live',          accent: '#EF4444', bg: '#5f1e1e' },
  { id: 'notes',         label: 'Study Notes',   Icon: BookIcon,      href: '/dashboard/teacher/notes',         accent: '#6366F1', bg: '#1e2060' },
  { id: 'quizzes',       label: 'Quizzes',        Icon: AwardIcon,     href: '/dashboard/teacher/quizzes',       accent: '#8B5CF6', bg: '#2e1f5e' },
  { id: 'timetable',     label: 'Timetable',      Icon: ClockIcon,     href: '/dashboard/teacher/timetable',     accent: '#06B6D4', bg: '#0a3040' },
  { id: 'syllabus',      label: 'Syllabus',       Icon: BookOpenIcon,  href: '/dashboard/teacher/syllabus',      accent: '#F97316', bg: '#4a2810' },
  { id: 'attendance',    label: 'Attendance',     Icon: CalendarIcon,  href: '/dashboard/teacher/attendance',    accent: '#14B8A6', bg: '#0f3d38' },
  { id: 'announcements', label: 'Announcements',  Icon: MegaphoneIcon, href: '/dashboard/teacher/announcements', accent: '#EC4899', bg: '#5a1a40' },
  { id: 'chat',          label: 'Messages',       Icon: MessageIcon,   href: '/dashboard/teacher/chat',          accent: '#7C3AED', bg: '#2d1060' },
  { id: 'ai',            label: 'AI Assistant',   Icon: AiIcon,        href: '/dashboard/teacher/ai',            accent: '#F59E0B', bg: '#4a3510' },
]

const NAV = [
  { href: '/dashboard/teacher/classes',    Icon: PeopleIcon,    label: 'Classes' },
  { href: '/dashboard/teacher/assignments',Icon: ClipboardIcon, label: 'Tasks'   },
  { href: '/dashboard/teacher',            home: true                             },
  { href: '/dashboard/teacher/chat',       Icon: MessageIcon,   label: 'Chat'    },
  { href: '/dashboard/teacher/results',    Icon: BarChartIcon,  label: 'Results' },
]

interface Props { profile: any; school: any; userId: string; counts?: any }

export default function TeacherDashboardClient({ profile, school, userId, counts = {} }: Props) {
  const pathname    = usePathname()
  const schoolColor = school?.primary_color ?? '#7C3AED'
  const firstName   = profile?.full_name?.split(' ')[0] ?? 'Teacher'

  function isActive(href: string, home?: boolean) {
    if (home) return pathname === '/dashboard/teacher'
    if (href === '/dashboard/teacher') return pathname === href
    return pathname.startsWith(href)
  }

  return (
    <div className={styles.page}>
      <DashboardHeader userId={userId} role="teacher" profile={profile} school={school} schoolColor={schoolColor} />

      <main className={styles.main}>
        {/* Greeting */}
        <div className={styles.greeting}>
          <h1 className={styles.greetingName}>Hi, {firstName} 👋</h1>
          <p className={styles.greetingSub}>Here's your teaching overview</p>
        </div>

        {/* Stats */}
        <div className={styles.statsRow}>
          {[
            { label: 'Classes',    value: counts.classCount    ?? 0, color: '#3B82F6' },
            { label: 'Students',   value: counts.studentCount  ?? 0, color: '#10B981' },
            { label: 'Assignments',value: counts.assignmentCount ?? 0, color: '#F59E0B' },
            { label: 'Pending',    value: counts.pendingGrading ?? 0, color: '#EF4444' },
          ].map(s => (
            <div key={s.label} className={styles.statCard}>
              <p className={styles.statVal} style={{ color: s.color }}>{s.value}</p>
              <p className={styles.statLbl}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Modules */}
        <p className={styles.sectionLabel}>Quick Access</p>
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

      {/* Bottom nav */}
      <RoleNav
        items={NAV}
        homeHref="/dashboard/teacher"
        schoolColor={schoolColor}
      />

      {/* Floating chat widget */}
      <ChatWidget userId={userId} role="teacher" schoolColor={schoolColor} />
    </div>
  )
}
