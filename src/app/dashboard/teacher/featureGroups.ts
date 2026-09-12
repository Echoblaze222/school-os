// src/app/dashboard/teacher/featureGroups.ts
// Shared across every teacher sub-page that uses RoleSubHeader, so the
// bottom dock / "all features" sheet is identical everywhere a teacher
// navigates - not just on the dashboard home screen. Extracted from
// TeacherDashboardClient.tsx, which now imports this instead of defining
// its own local copy.

import { FeatureGroup } from '@/components/AllFeaturesSheet'
import {
  PeopleIcon, ClipboardIcon, BarChartIcon,
  VideoIcon, BookIcon, BellIcon, CalendarIcon,
  AwardIcon, MessageIcon, BookOpenIcon, ClockIcon,
  MegaphoneIcon, ShieldIcon, UserIcon, ActivityIcon,
} from '@/components/Icons'

export const TEACHER_FEATURE_GROUPS: FeatureGroup[] = [
  { name: 'Teaching', items: [
    { id: 'classes',     label: 'My classes',  href: '/dashboard/teacher/classes',     Icon: PeopleIcon },
    { id: 'attendance',  label: 'Attendance',  href: '/dashboard/teacher/attendance',  Icon: CalendarIcon },
    { id: 'assignments', label: 'Assignments', href: '/dashboard/teacher/assignments', Icon: ClipboardIcon },
    { id: 'grades',      label: 'Grades',      href: '/dashboard/teacher/grades',      Icon: BarChartIcon },
    { id: 'quizzes',     label: 'Quizzes',     href: '/dashboard/teacher/quizzes',     Icon: AwardIcon },
    { id: 'results',     label: 'Results',     href: '/dashboard/teacher/results',     Icon: BarChartIcon },
  ]},
  { name: 'Around school', items: [
    { id: 'live',      label: 'Live class', href: '/dashboard/teacher/live',      Icon: VideoIcon },
    { id: 'notes',     label: 'Study notes',href: '/dashboard/teacher/notes',     Icon: BookIcon },
    { id: 'timetable', label: 'Timetable',  href: '/dashboard/teacher/timetable', Icon: ClockIcon },
    { id: 'syllabus',  label: 'Syllabus',   href: '/dashboard/teacher/syllabus',  Icon: BookOpenIcon },
    { id: 'clinic',    label: 'Clinic',     href: '/dashboard/teacher/clinic',    Icon: ActivityIcon },
  ]},
  { name: 'Communication', items: [
    { id: 'chat',          label: 'Messages',      href: '/dashboard/teacher/chat',          Icon: MessageIcon },
    { id: 'announcements', label: 'Announcements', href: '/dashboard/teacher/announcements', Icon: MegaphoneIcon },
    { id: 'meetings',      label: 'Staff meetings',href: '/dashboard/teacher/meetings',      Icon: CalendarIcon },
    { id: 'notices',       label: 'Notices',       href: '/dashboard/teacher/notifications', Icon: BellIcon },
  ]},
  { name: 'Account', items: [
    { id: 'audit',   label: 'Audit log', href: '/dashboard/teacher/audit',   Icon: ShieldIcon },
    { id: 'profile', label: 'Profile',   href: '/dashboard/teacher/profile', Icon: UserIcon },
  ]},
]
