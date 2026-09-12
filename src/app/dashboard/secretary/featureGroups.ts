// src/app/dashboard/secretary/featureGroups.ts
// Shared across every secretary sub-page that uses RoleSubHeader, so the
// bottom dock / "all features" sheet is identical everywhere a secretary
// navigates - not just on the dashboard home screen. Extracted from
// SecretaryClient.tsx, which now imports this instead of defining its
// own local copy.

import { FeatureGroup } from '@/components/AllFeaturesSheet'
import {
  UserIcon, UsersIcon, CalendarIcon,
  MessageIcon, BellIcon, SettingsIcon, FolderIcon,
  ClipboardIcon, CheckCircleIcon, BookOpenIcon,
  RefreshIcon, GraduationCapIcon, FileTextIcon, BookIcon, ActivityIcon,
} from '@/components/Icons'

export const SECRETARY_FEATURE_GROUPS: FeatureGroup[] = [
  { name: 'Front desk', items: [
    { id: 'students',    label: 'Students',    href: '/dashboard/secretary/students',    Icon: UsersIcon },
    // 'Applications' was a duplicate of 'Admissions' pointed at a
    // separate, disconnected table - consolidated (Phase 4, Lane D).
    { id: 'admissions',  label: 'Admissions',  href: '/dashboard/secretary/admissions',  Icon: GraduationCapIcon },
    { id: 'transfers',   label: 'Transfers',   href: '/dashboard/secretary/transfers',   Icon: RefreshIcon },
    { id: 'clinic',      label: 'Clinic',      href: '/dashboard/secretary/clinic',      Icon: ActivityIcon },
    { id: 'codes',       label: 'Access codes',href: '/dashboard/secretary/codes',       Icon: CheckCircleIcon },
  ]},
  { name: 'Records', items: [
    { id: 'users',     label: 'Users',     href: '/dashboard/secretary/users',     Icon: UserIcon },
    { id: 'records',   label: 'Records',   href: '/dashboard/secretary/records',   Icon: FolderIcon },
    { id: 'documents', label: 'Documents', href: '/dashboard/secretary/documents', Icon: BookOpenIcon },
    { id: 'library',   label: 'Library',   href: '/dashboard/secretary/library',   Icon: BookIcon },
  ]},
  { name: 'Communication', items: [
    { id: 'notices',       label: 'Notices',  href: '/dashboard/secretary/notices',       Icon: BellIcon },
    { id: 'chat',          label: 'Messages', href: '/dashboard/secretary/chat',          Icon: MessageIcon },
    { id: 'calendar',      label: 'Calendar', href: '/dashboard/secretary/calendar',      Icon: CalendarIcon },
    { id: 'meetings',      label: 'Meetings', href: '/dashboard/secretary/meetings',      Icon: CalendarIcon },
  ]},
  { name: 'Account', items: [
    { id: 'settings', label: 'Settings', href: '/dashboard/secretary/settings', Icon: SettingsIcon },
  ]},
]
