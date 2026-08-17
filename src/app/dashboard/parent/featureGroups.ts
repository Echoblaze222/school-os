// src/app/dashboard/parent/featureGroups.ts
// Shared "All features" list for the Parent role - used by RoleHeroHeader
// (dashboard home) and RoleSubHeader (every other Parent page) so the sheet
// stays identical everywhere instead of drifting per page.

import { FeatureGroup } from '@/components/AllFeaturesSheet'
import {
  UserIcon, BarChartIcon, WalletIcon, MessageIcon,
  CalendarIcon, ClipboardIcon, ClockIcon, TrophyIcon, BookIcon, ActivityIcon,
} from '@/components/Icons'

export const PARENT_FEATURE_GROUPS: FeatureGroup[] = [
  { name: 'My children', items: [
    { id: 'child',       label: "Child's profile", href: '/dashboard/parent/child',       Icon: UserIcon },
    { id: 'attendance',  label: 'Attendance',       href: '/dashboard/parent/attendance',  Icon: CalendarIcon },
    { id: 'timetable',   label: 'Timetable',        href: '/dashboard/parent/timetable',   Icon: ClockIcon },
    { id: 'assignments', label: 'Assignments',      href: '/dashboard/parent/assignments', Icon: ClipboardIcon },
  ]},
  { name: 'Progress', items: [
    { id: 'results',     label: 'Results',     href: '/dashboard/parent/results',     Icon: BarChartIcon },
    { id: 'fees',        label: 'Fees',        href: '/dashboard/parent/fees',        Icon: WalletIcon },
    { id: 'leaderboard', label: 'Leaderboard', href: '/dashboard/parent/leaderboard', Icon: TrophyIcon },
    { id: 'library',     label: 'Library',     href: '/dashboard/parent/library',     Icon: BookIcon },
    { id: 'clinic',      label: 'Clinic',      href: '/dashboard/parent/clinic',      Icon: ActivityIcon },
  ]},
  { name: 'Communication', items: [
    { id: 'chat',     label: 'Messages', href: '/dashboard/parent/chat',     Icon: MessageIcon },
    { id: 'meetings', label: 'Meetings', href: '/dashboard/parent/meetings', Icon: CalendarIcon },
  ]},
  { name: 'Account', items: [
    { id: 'profile', label: 'Profile', href: '/dashboard/parent/profile', Icon: UserIcon },
  ]},
]
