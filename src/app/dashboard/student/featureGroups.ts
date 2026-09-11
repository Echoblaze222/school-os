// src/app/dashboard/student/featureGroups.ts
// Shared across every student sub-page that uses RoleSubHeader, so the
// bottom dock / "all features" sheet is identical everywhere a student
// navigates - not just on the dashboard home screen. Extracted from
// StudentDashboardClient.tsx, which now imports this instead of defining
// its own local copy.

import { FeatureGroup } from '@/components/AllFeaturesSheet'
import {
  ClipboardIcon, ClockIcon, VideoIcon, BarChartIcon, AwardIcon,
  BookIcon, MessageIcon, CalendarIcon, FileTextIcon, BookOpenIcon,
  GlobeIcon, TrophyIcon, IdCardIcon, GraduationCapIcon,
} from '@/components/Icons'

export const STUDENT_FEATURE_GROUPS: FeatureGroup[] = [
  { name: 'Learning', items: [
    { id: 'assignments', label: 'Assignments', href: '/dashboard/student/assignments', Icon: ClipboardIcon },
    { id: 'results',     label: 'Results',     href: '/dashboard/student/results',     Icon: BarChartIcon },
    { id: 'quizzes',     label: 'Quizzes',     href: '/dashboard/student/quizzes',     Icon: AwardIcon },
    { id: 'classes',     label: 'Live classes',href: '/dashboard/student/classes',     Icon: VideoIcon },
    { id: 'notes',       label: 'Notes',       href: '/dashboard/student/notes',       Icon: BookIcon },
    { id: 'syllabus',    label: 'Syllabus',    href: '/dashboard/student/syllabus',    Icon: BookOpenIcon },
  ]},
  { name: 'Around school', items: [
    { id: 'timetable',   label: 'Timetable',   href: '/dashboard/student/timetable',   Icon: ClockIcon },
    { id: 'library',     label: 'Library',     href: '/dashboard/student/library',     Icon: BookIcon },
    { id: 'leaderboard', label: 'Leaderboard', href: '/dashboard/student/leaderboard', Icon: TrophyIcon },
    { id: 'id-card',     label: 'My ID card',  href: '/dashboard/student/id-card',     Icon: IdCardIcon },
    { id: 'records',     label: 'Records',     href: '/dashboard/student/records',     Icon: FileTextIcon },
    { id: 'alumni',      label: 'Alumni',      href: '/dashboard/student/alumni',      Icon: GlobeIcon },
    { id: 'certificates',label: 'Certificate', href: '/dashboard/student/certificates',Icon: GraduationCapIcon },
  ]},
  { name: 'Communication', items: [
    { id: 'chat',     label: 'Messages', href: '/dashboard/student/chat',     Icon: MessageIcon },
    { id: 'meetings', label: 'Meetings', href: '/dashboard/student/meetings', Icon: CalendarIcon },
    { id: 'schedule', label: 'Study plan',href: '/dashboard/student/schedule',Icon: CalendarIcon },
  ]},
]
