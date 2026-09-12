// src/app/dashboard/counselor/featureGroups.ts
// Shared across every counselor sub-page that uses RoleSubHeader, so the
// bottom dock / "all features" sheet is identical everywhere a counselor
// navigates - not just on the dashboard home screen. Extracted from
// CounselorDashboardClient.tsx, which now imports this instead of
// defining its own local copy.

import { FeatureGroup } from '@/components/AllFeaturesSheet'
import {
  HeartIcon, CalendarIcon, ShieldIcon, BarChartIcon,
  MessageIcon, BellIcon, UserIcon,
} from '@/components/Icons'

export const COUNSELOR_FEATURE_GROUPS: FeatureGroup[] = [
  { name: 'Counseling', items: [
    { id: 'cases',        label: 'Caseload',      href: '/dashboard/counselor/cases',        Icon: HeartIcon },
    { id: 'appointments', label: 'Appointments',  href: '/dashboard/counselor/appointments',  Icon: CalendarIcon },
    { id: 'referrals',    label: 'Referrals',     href: '/dashboard/counselor/referrals',     Icon: ShieldIcon },
    { id: 'reports',      label: 'Reports',       href: '/dashboard/counselor/reports',       Icon: BarChartIcon },
    { id: 'meetings',     label: 'Meetings',      href: '/dashboard/counselor/meetings',      Icon: CalendarIcon },
  ]},
  { name: 'Communication', items: [
    { id: 'chat',          label: 'Messages',      href: '/dashboard/counselor/chat',          Icon: MessageIcon },
    { id: 'notifications', label: 'Notifications', href: '/dashboard/counselor/notifications', Icon: BellIcon },
  ]},
  { name: 'Account', items: [
    { id: 'profile', label: 'My Profile', href: '/dashboard/counselor/profile', Icon: UserIcon },
  ]},
]
