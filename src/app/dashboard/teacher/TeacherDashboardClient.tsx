'use client'
// src/app/dashboard/teacher/TeacherDashboardClient.tsx
// FIX #2: Bottom nav redesigned (Attend replaces Results, More drawer added)
// FIX #5: Audit added to grid and More drawer
// FIX #13: Grid split into Daily (top 6) and More Tools (rest)

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import DashboardHeader from '@/components/DashboardHeader'
import ChatWidget from '@/components/ChatWidget'
import {
  HomeIcon, PeopleIcon, ClipboardIcon, BarChartIcon,
  VideoIcon, BookIcon, BellIcon, CalendarIcon,
  AwardIcon, MessageIcon, BookOpenIcon, ClockIcon,
  AiIcon, MegaphoneIcon, ShieldIcon, UserIcon,
} from '@/components/Icons'
import RoleNav from '@/components/RoleNav'
import styles from './teacher.module.css'

// ── Daily-use modules (top 6, always visible) ──────────────────
const DAILY_MODULES = [
  { id: 'classes',    label: 'My Classes',  Icon: PeopleIcon,    href: '/dashboard/teacher/classes',    accent: '#3B82F6', bg: '#1e3a5f' },
  { id: 'attendance', label: 'Attendance',  Icon: CalendarIcon,  href: '/dashboard/teacher/attendance', accent: '#14B8A6', bg: '#0f3d38' },
  { id: 'assignments',label: 'Assignments', Icon: ClipboardIcon, href: '/dashboard/teacher/assignments',accent: '#F59E0B', bg: '#4a3510' },
  { id: 'grades',     label: 'Grades',      Icon: BarChartIcon,  href: '/dashboard/teacher/grades',     accent: '#10B981', bg: '#1a4a3a' },
  { id: 'chat',       label: 'Messages',    Icon: MessageIcon,   href: '/dashboard/teacher/chat',       accent: '#7C3AED', bg: '#2d1060' },
  { id: 'ai',         label: 'AI Assistant',Icon: AiIcon,        href: '/dashboard/teacher/ai',         accent: '#F59E0B', bg: '#4a3510' },
]

// ── More Tools (collapsible) ────────────────────────────────────
const MORE_MODULES = [
  { id: 'live',          label: 'Live Class',    Icon: VideoIcon,     href: '/dashboard/teacher/live',          accent: '#EF4444', bg: '#5f1e1e' },
  { id: 'quizzes',       label: 'Quizzes',       Icon: AwardIcon,     href: '/dashboard/teacher/quizzes',       accent: '#8B5CF6', bg: '#2e1f5e' },
  { id: 'results',       label: 'Results',       Icon: BarChartIcon,  href: '/dashboard/teacher/results',       accent: '#10B981', bg: '#1a4a3a' },
  { id: 'notes',         label: 'Study Notes',   Icon: BookIcon,      href: '/dashboard/teacher/notes',         accent: '#6366F1', bg: '#1e2060' },
  { id: 'timetable',     label: 'Timetable',     Icon: ClockIcon,     href: '/dashboard/teacher/timetable',     accent: '#06B6D4', bg: '#0a3040' },
  { id: 'syllabus',      label: 'Syllabus',      Icon: BookOpenIcon,  href: '/dashboard/teacher/syllabus',      accent: '#F97316', bg: '#4a2810' },
  { id: 'announcements', label: 'Announcements', Icon: MegaphoneIcon, href: '/dashboard/teacher/announcements', accent: '#EC4899', bg: '#5a1a40' },
  { id: 'audit',         label: 'Audit Log',     Icon: ShieldIcon,    href: '/dashboard/teacher/audit',         accent: '#64748B', bg: '#1a2030' },
  { id: 'profile',       label: 'My Profile',    Icon: UserIcon,      href: '/dashboard/teacher/profile',       accent: '#94A3B8', bg: '#1a2030' },
]

interface Props {
  profile: any
  school:  any
  userId:  string
  counts?: {
    classCount:      number
    studentCount:    number
    assignmentCount: number
    pendingGrading:  number
    quizCount:       number
  }
}

export default function TeacherDashboardClient({ profile, school, userId, counts = {} as any }: Props) {
  const pathname    = usePathname()
  const schoolColor = school?.primary_color ?? '#7C3AED'
  const firstName   = profile?.full_name?.split(' ')[0] ?? 'Teacher'
  const [showMore,  setShowMore] = useState(false)

  // Determine teacher role display
  const teacherRoleLabel =
    profile?.teacher_role_type === 'class_teacher'   ? '• Class Teacher' :
    profile?.teacher_role_type === 'subject_teacher' ? '• Subject Teacher' :
    profile?.teacher_role_type === 'both'            ? '• Class + Subject Teacher' : ''

  function isActive(href: string, home?: boolean) {
    if (home) return pathname === '/dashboard/teacher'
    if (href === '/dashboard/teacher') return pathname === href
    return pathname.startsWith(href)
  }

  // Greeting based on time of day
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className={styles.page}>
      <DashboardHeader
        userId={userId}
        role="teacher"
        profile={profile}
        school={school}
        schoolColor={schoolColor}
      />

      <main className={styles.main}>
        {/* Greeting */}
        <div className={styles.greeting}>
          <h1 className={styles.greetingName}>
            {greeting}, {firstName} 👋
          </h1>
          <p className={styles.greetingSub}>
            Here's your teaching overview
            {teacherRoleLabel && (
              <span style={{ color: schoolColor, marginLeft: 6, fontWeight: 600 }}>
                {teacherRoleLabel}
              </span>
            )}
          </p>
        </div>

        {/* Stats — FIX #4: real data */}
        <div className={styles.statsRow}>
          {[
            { label: 'Classes',    value: counts.classCount      ?? 0, color: '#3B82F6' },
            { label: 'Students',   value: counts.studentCount    ?? 0, color: '#10B981' },
            { label: 'Active',     value: counts.assignmentCount ?? 0, color: '#F59E0B' },
            { label: 'To Grade',   value: counts.pendingGrading  ?? 0, color: '#EF4444' },
          ].map(s => (
            <div key={s.label} className={styles.statCard}>
              <p className={styles.statVal} style={{ color: s.color }}>{s.value}</p>
              <p className={styles.statLbl}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Pending grading alert — FIX #4 */}
        {(counts.pendingGrading ?? 0) > 0 && (
          <Link
            href="/dashboard/teacher/grades"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              background: '#EF444415',
              border: '1px solid #EF444440',
              borderRadius: 10,
              marginBottom: 'var(--space-5)',
              textDecoration: 'none',
              color: '#EF4444',
              fontSize: '0.82rem',
              fontWeight: 600,
            }}
          >
            <span style={{ fontSize: 16 }}>⚠️</span>
            {counts.pendingGrading} submission{counts.pendingGrading === 1 ? '' : 's'} waiting to be graded
            <span style={{ marginLeft: 'auto', opacity: 0.6 }}>→</span>
          </Link>
        )}

        {/* Daily modules — FIX #13 */}
        <p className={styles.sectionLabel}>Daily</p>
        <div className={styles.moduleGrid} style={{ marginBottom: 'var(--space-5)' }}>
          {DAILY_MODULES.map(mod => (
            <Link
              key={mod.id}
              href={mod.href}
              className={`${styles.moduleCard} ${isActive(mod.href) ? styles.moduleActive : ''}`}
            >
              <div className={styles.modIcon} style={{ background: mod.bg }}>
                <mod.Icon size={22} color={mod.accent} />
              </div>
              <span className={styles.modLabel}>{mod.label}</span>
            </Link>
          ))}
        </div>

        {/* More Tools toggle — FIX #13 */}
        <button
          onClick={() => setShowMore(prev => !prev)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0 0 var(--space-3)',
            marginBottom: 'var(--space-2)',
          }}
        >
          <p className={styles.sectionLabel} style={{ margin: 0 }}>
            More Tools
          </p>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 1 }}>
            {showMore ? '▲' : '▼'}
          </span>
        </button>

        {showMore && (
          <div className={styles.moduleGrid} style={{ marginBottom: 'var(--space-6)' }}>
            {MORE_MODULES.map(mod => (
              <Link
                key={mod.id}
                href={mod.href}
                className={`${styles.moduleCard} ${isActive(mod.href) ? styles.moduleActive : ''}`}
              >
                <div className={styles.modIcon} style={{ background: mod.bg }}>
                  <mod.Icon size={22} color={mod.accent} />
                </div>
                <span className={styles.modLabel}>{mod.label}</span>
              </Link>
            ))}
          </div>
        )}

        <div className={styles.spacer} />
      </main>

      {/* FIX #2: Bottom nav handled by RoleNav with updated config */}
      <RoleNav
        userId={userId}
        profile={profile}
        school={school}
        role="teacher"
        schoolColor={schoolColor}
      />

      {/* FIX #6: ChatWidget hidden on chat page to avoid duplication */}
      <ChatWidget userId={userId} role="teacher" schoolColor={schoolColor} />
    </div>
  )
}
