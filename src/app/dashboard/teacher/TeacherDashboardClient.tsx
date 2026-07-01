'use client'
// src/app/dashboard/teacher/TeacherDashboardClient.tsx

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import DashboardHeader from '@/components/DashboardHeader'
import ChatWidget from '@/components/ChatWidget'
import RecentActivity, { ActivityItem } from '@/components/RecentActivity'   // ← NEW
import {
  HomeIcon, PeopleIcon, ClipboardIcon, BarChartIcon,
  VideoIcon, BookIcon, BellIcon, CalendarIcon,
  AwardIcon, MessageIcon, BookOpenIcon, ClockIcon,
  AiIcon, MegaphoneIcon, ShieldIcon, UserIcon,
} from '@/components/Icons'
import RoleNav from '@/components/RoleNav'
import styles from './teacher.module.css'
import motion from '@/components/dashboard-motion.module.css'               // ← NEW

const DAILY_MODULES = [
  { id: 'classes',    label: 'My Classes',  Icon: PeopleIcon,    href: '/dashboard/teacher/classes',    accent: '#3B82F6', bg: '#1e3a5f' },
  { id: 'attendance', label: 'Attendance',  Icon: CalendarIcon,  href: '/dashboard/teacher/attendance', accent: '#14B8A6', bg: '#0f3d38' },
  { id: 'assignments',label: 'Assignments', Icon: ClipboardIcon, href: '/dashboard/teacher/assignments',accent: '#F59E0B', bg: '#4a3510' },
  { id: 'grades',     label: 'Grades',      Icon: BarChartIcon,  href: '/dashboard/teacher/grades',     accent: '#10B981', bg: '#1a4a3a' },
  { id: 'chat',       label: 'Messages',    Icon: MessageIcon,   href: '/dashboard/teacher/chat',       accent: '#7C3AED', bg: '#2d1060' },
  { id: 'ai',         label: 'AI Assistant',Icon: AiIcon,        href: '/dashboard/teacher/ai',         accent: '#F59E0B', bg: '#4a3510' },
]

const MORE_MODULES = [
  { id: 'live',          label: 'Live Class',    Icon: VideoIcon,     href: '/dashboard/teacher/live',          accent: '#EF4444', bg: '#5f1e1e' },
  { id: 'quizzes',       label: 'Quizzes',       Icon: AwardIcon,     href: '/dashboard/teacher/quizzes',       accent: '#8B5CF6', bg: '#2e1f5e' },
  { id: 'results',       label: 'Results',       Icon: BarChartIcon,  href: '/dashboard/teacher/results',       accent: '#10B981', bg: '#1a4a3a' },
  { id: 'notes',         label: 'Study Notes',   Icon: BookIcon,      href: '/dashboard/teacher/notes',         accent: '#6366F1', bg: '#1e2060' },
  { id: 'timetable',     label: 'Timetable',     Icon: ClockIcon,     href: '/dashboard/teacher/timetable',     accent: '#06B6D4', bg: '#0a3040' },
  { id: 'syllabus',      label: 'Syllabus',      Icon: BookOpenIcon,  href: '/dashboard/teacher/syllabus',      accent: '#F97316', bg: '#4a2810' },
  { id: 'announcements', label: 'Announcements', Icon: MegaphoneIcon, href: '/dashboard/teacher/announcements', accent: '#EC4899', bg: '#5a1a40' },
  { id: 'audit',         label: 'Audit Log',     Icon: ShieldIcon,    href: '/dashboard/teacher/audit',         accent: '#64748B', bg: '#1a2030' },
  { id: 'meetings',      label: 'Meetings',      Icon: CalendarIcon,  href: '/dashboard/teacher/meetings',      accent: '#06B6D4', bg: '#0a3040' },
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
  activities: ActivityItem[]   // ← NEW
}

export default function TeacherDashboardClient({ profile, school, userId, counts = {} as any, activities }: Props) {
  const pathname    = usePathname()
  const schoolColor = school?.primary_color ?? '#7C3AED'
  const firstName   = profile?.full_name?.split(' ')[0] ?? 'Teacher'
  const [showMore,  setShowMore] = useState(false)

  const teacherRoleLabel =
    profile?.teacher_role_type === 'class_teacher'   ? '• Class Teacher' :
    profile?.teacher_role_type === 'subject_teacher' ? '• Subject Teacher' :
    profile?.teacher_role_type === 'both'            ? '• Class + Subject Teacher' : ''

  function isActive(href: string, home?: boolean) {
    if (home) return pathname === '/dashboard/teacher'
    if (href === '/dashboard/teacher') return pathname === href
    return pathname.startsWith(href)
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  // ── NEW: delete handler wired to Supabase ──────────────────────────────
  async function handleDeleteActivity(id: string) {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.from('recent_activities').delete().eq('id', id).eq('user_id', userId)
  }

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
        {/* Greeting — now animates in, emoji waves once */}
        <div className={`${styles.greeting} ${motion.riseIn}`}>
          <h1 className={styles.greetingName}>
            {greeting}, {firstName} <span className={motion.waveEmoji}>👋</span>
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

        {/* Stats — staggered entrance */}
        <div className={styles.statsRow}>
          {[
            { label: 'Classes',    value: counts.classCount      ?? 0, color: '#3B82F6' },
            { label: 'Students',   value: counts.studentCount    ?? 0, color: '#10B981' },
            { label: 'Active',     value: counts.assignmentCount ?? 0, color: '#F59E0B' },
            { label: 'To Grade',   value: counts.pendingGrading  ?? 0, color: '#EF4444' },
          ].map((s, i) => (
            <div
              key={s.label}
              className={`${styles.statCard} ${motion.staggerItem} ${motion.pressable}`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <p className={styles.statVal} style={{ color: s.color }}>{s.value}</p>
              <p className={styles.statLbl}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Pending grading alert */}
        {(counts.pendingGrading ?? 0) > 0 && (
          <Link
            href="/dashboard/teacher/grades"
            className={`${motion.riseIn} ${motion.pressable}`}
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
              animationDelay: '150ms',
            }}
          >
            <span style={{ fontSize: 16 }}>⚠️</span>
            {counts.pendingGrading} submission{counts.pendingGrading === 1 ? '' : 's'} waiting to be graded
            <span style={{ marginLeft: 'auto', opacity: 0.6 }}>→</span>
          </Link>
        )}

        {/* Daily modules — staggered */}
        <p className={styles.sectionLabel}>Daily</p>
        <div className={styles.moduleGrid} style={{ marginBottom: 'var(--space-5)' }}>
          {DAILY_MODULES.map((mod, i) => (
            <Link
              key={mod.id}
              href={mod.href}
              className={`${styles.moduleCard} ${motion.staggerItem} ${motion.pressable} ${isActive(mod.href) ? styles.moduleActive : ''}`}
              style={{ animationDelay: `${200 + i * 40}ms` }}
            >
              <div className={styles.modIcon} style={{ background: mod.bg }}>
                <mod.Icon size={22} color={mod.accent} />
              </div>
              <span className={styles.modLabel}>{mod.label}</span>
            </Link>
          ))}
        </div>

        {/* More Tools toggle */}
        <button
          onClick={() => setShowMore(prev => !prev)}
          className={motion.pressable}
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
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 1, transition: 'transform 0.2s ease', transform: showMore ? 'rotate(180deg)' : 'none' }}>
            ▼
          </span>
        </button>

        {showMore && (
          <div className={styles.moduleGrid} style={{ marginBottom: 'var(--space-6)' }}>
            {MORE_MODULES.map((mod, i) => (
              <Link
                key={mod.id}
                href={mod.href}
                className={`${styles.moduleCard} ${motion.staggerItem} ${motion.pressable} ${isActive(mod.href) ? styles.moduleActive : ''}`}
                style={{ animationDelay: `${i * 35}ms` }}
              >
                <div className={styles.modIcon} style={{ background: mod.bg }}>
                  <mod.Icon size={22} color={mod.accent} />
                </div>
                <span className={styles.modLabel}>{mod.label}</span>
              </Link>
            ))}
          </div>
        )}

        {/* NEW: Recent Activity feed */}
        <RecentActivity
          items={activities}
          accentColor={schoolColor}
          onDelete={handleDeleteActivity}
          emptyLabel="Nothing yet — grading, attendance, and messages will show up here"
        />

        <div className={styles.spacer} />
      </main>

      <RoleNav
        userId={userId}
        profile={profile}
        school={school}
        role="teacher"
        schoolColor={schoolColor}
      />

      <ChatWidget userId={userId} role="teacher" schoolColor={schoolColor} />
    </div>
  )
}
