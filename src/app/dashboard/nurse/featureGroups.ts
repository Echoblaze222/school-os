// src/app/dashboard/nurse/featureGroups.ts
// Shared across every nurse sub-page that uses RoleSubHeader, so the
// bottom dock / "all features" sheet is identical everywhere a nurse
// navigates - not just on the dashboard home screen. Extracted from
// NurseDashboardClient.tsx, which now imports this instead of defining
// its own local copy.

import { FeatureGroup } from '@/components/AllFeaturesSheet'
import {
  HeartIcon, ClipboardIcon, ClockIcon, GridIcon, AiIcon, MessageIcon, BellIcon, UserIcon, CalendarIcon,
} from '@/components/Icons'

export const NURSE_FEATURE_GROUPS: FeatureGroup[] = [
  { name: 'Clinic', items: [
    { id: 'visits',        label: 'Clinic Visits',   href: '/dashboard/nurse/visits',        Icon: HeartIcon },
    { id: 'health-records', label: 'Health Records', href: '/dashboard/nurse/health-records', Icon: ClipboardIcon },
    { id: 'medications',   label: 'Medications',     href: '/dashboard/nurse/medications',    Icon: ClockIcon },
    { id: 'inventory',     label: 'Inventory',       href: '/dashboard/nurse/inventory',      Icon: GridIcon },
    { id: 'meetings',      label: 'Meetings',        href: '/dashboard/nurse/meetings',       Icon: CalendarIcon },
  ]},
  { name: 'Communication', items: [
    { id: 'chat',          label: 'Messages',      href: '/dashboard/nurse/chat',          Icon: MessageIcon },
    { id: 'notifications', label: 'Notifications', href: '/dashboard/nurse/notifications', Icon: BellIcon },
  ]},
  { name: 'Account', items: [
    { id: 'ai',      label: 'AI Assistant', href: '/dashboard/nurse/ai',      Icon: AiIcon },
    { id: 'profile', label: 'My Profile',   href: '/dashboard/nurse/profile', Icon: UserIcon },
  ]},
]
