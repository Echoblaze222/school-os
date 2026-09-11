// src/app/dashboard/principal/featureGroups.ts
// Shared across every principal sub-page that uses RoleSubHeader, so the
// bottom dock / "all features" sheet is identical everywhere a principal
// navigates - not just on the dashboard home screen. Extracted from
// PrincipalDashboardClient.tsx, which now imports this instead of defining
// its own local copy.

import { FeatureGroup } from '@/components/AllFeaturesSheet'
import {
  PeopleIcon, SchoolIcon, WalletIcon,
  MessageIcon, BellIcon, ClipboardIcon,
  SettingsIcon, MegaphoneIcon, VideoIcon,
  FileTextIcon, TrophyIcon, KeyIcon, UserIcon,
  LayersIcon, CalendarIcon, GlobeIcon, RefreshIcon, GraduationCapIcon,
  ShieldIcon, TagIcon, BarChartIcon, StarIcon,
} from '@/components/Icons'

export const PRINCIPAL_FEATURE_GROUPS: FeatureGroup[] = [
  { name: 'People', items: [
    { id: 'staff',    label: 'Staff',    href: '/dashboard/principal/staff',    Icon: PeopleIcon },
    { id: 'teachers', label: 'Teachers', href: '/dashboard/principal/teachers', Icon: UserIcon },
    { id: 'students', label: 'Students', href: '/dashboard/principal/students', Icon: SchoolIcon },
    { id: 'leadership', label: 'Leadership', href: '/dashboard/principal/leadership', Icon: TrophyIcon },
    { id: 'alumni',   label: 'Alumni',   href: '/dashboard/principal/alumni',   Icon: GlobeIcon },
    { id: 'certificates', label: 'Certificates', href: '/dashboard/principal/certificates', Icon: GraduationCapIcon },
    { id: 'transfers',label: 'Transfers',href: '/dashboard/principal/transfers',Icon: RefreshIcon },
  ]},
  { name: 'Academics', items: [
    { id: 'classes',     label: 'Classes',     href: '/dashboard/principal/classes',     Icon: LayersIcon },
    { id: 'results',     label: 'Results',     href: '/dashboard/principal/results',     Icon: TrophyIcon },
    { id: 'report-cards',label: 'Report cards',href: '/dashboard/principal/report-cards',Icon: FileTextIcon },
    { id: 'analytics',   label: 'Analytics',   href: '/dashboard/principal/analytics',   Icon: BarChartIcon },
    { id: 'assignments', label: 'Assignments', href: '/dashboard/principal/assignments', Icon: ClipboardIcon },
    { id: 'codes',       label: 'Access codes',href: '/dashboard/principal/codes',       Icon: KeyIcon },
  ]},
  { name: 'Finance', items: [
    { id: 'fees',          label: 'Fees',          href: '/dashboard/principal/fees',          Icon: WalletIcon },
    { id: 'reports',       label: 'Reports',       href: '/dashboard/principal/reports',       Icon: FileTextIcon },
    { id: 'subscriptions', label: 'Subscriptions', href: '/dashboard/principal/subscriptions', Icon: ShieldIcon },
  ]},
  { name: 'Communication', items: [
    { id: 'chat',          label: 'Messages',      href: '/dashboard/principal/chat',          Icon: MessageIcon },
    { id: 'notices',       label: 'Notices',       href: '/dashboard/principal/notices',       Icon: BellIcon },
    { id: 'announcements', label: 'Announcements', href: '/dashboard/principal/announcements', Icon: MegaphoneIcon },
    { id: 'promotions',    label: 'Promotions',    href: '/dashboard/principal/promotions',    Icon: StarIcon },
    { id: 'meetings',      label: 'Meetings',      href: '/dashboard/principal/meetings',      Icon: CalendarIcon },
    { id: 'live',          label: 'Live classes',  href: '/dashboard/principal/live',          Icon: VideoIcon },
  ]},
  { name: 'Account', items: [
    { id: 'profile',  label: 'Profile',  href: '/dashboard/principal/profile',  Icon: UserIcon },
    { id: 'branding', label: 'Branding', href: '/dashboard/principal/settings', Icon: TagIcon },
    { id: 'settings', label: 'Settings', href: '/dashboard/principal/settings', Icon: SettingsIcon },
  ]},
]
