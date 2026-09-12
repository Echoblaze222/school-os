// src/app/dashboard/examination/featureGroups.ts
// Shared across every examination sub-page that uses RoleSubHeader, so the
// bottom dock / "all features" sheet is identical everywhere an
// examination-committee member navigates - not just on the dashboard home
// screen. Extracted from ExaminationDashboardClient.tsx, which now imports
// this instead of defining its own local copy.

import { FeatureGroup } from '@/components/AllFeaturesSheet'
import {
  CalendarIcon, ClockIcon, ShieldIcon, CheckCircleIcon,
  FileTextIcon, AlertCircleIcon, BarChartIcon, MessageIcon, AiIcon, BellIcon, UserIcon,
} from '@/components/Icons'

export const EXAMINATION_FEATURE_GROUPS: FeatureGroup[] = [
  { name: 'Main', items: [
    { id: 'chat',          label: 'Messages',      href: '/dashboard/examination/chat',          Icon: MessageIcon },
    { id: 'ai',            label: 'AI Assistant',  href: '/dashboard/examination/ai',             Icon: AiIcon },
    { id: 'notifications', label: 'Notifications', href: '/dashboard/examination/notifications',  Icon: BellIcon },
  ]},
  { name: 'Exams', items: [
    { id: 'sessions',   label: 'Exam Sessions', href: '/dashboard/examination/sessions',   Icon: CalendarIcon },
    { id: 'timetable',  label: 'Timetable',     href: '/dashboard/examination/timetable',  Icon: ClockIcon },
  ]},
  { name: 'Conduct', items: [
    { id: 'invigilation', label: 'Invigilation',    href: '/dashboard/examination/invigilation', Icon: ShieldIcon },
    { id: 'attendance',   label: 'Exam Attendance', href: '/dashboard/examination/attendance',   Icon: CheckCircleIcon },
    { id: 'incidents',    label: 'Incidents',       href: '/dashboard/examination/incidents',    Icon: AlertCircleIcon },
    { id: 'meetings',     label: 'Meetings',        href: '/dashboard/examination/meetings',     Icon: CalendarIcon },
  ]},
  { name: 'Results', items: [
    { id: 'documents', label: 'Question Papers',  href: '/dashboard/examination/documents', Icon: FileTextIcon },
    { id: 'results',   label: 'Verify & Publish', href: '/dashboard/examination/results',   Icon: BarChartIcon },
  ]},
  { name: 'Account', items: [
    { id: 'profile', label: 'My Profile', href: '/dashboard/examination/profile', Icon: UserIcon },
  ]},
]
