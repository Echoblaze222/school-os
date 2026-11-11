// src/app/dashboard/ict/featureGroups.ts
// Shared across every ict sub-page that uses RoleSubHeader.

import { FeatureGroup } from '@/components/AllFeaturesSheet'
import {
  ClipboardIcon, ActivityIcon, UserIcon, CheckCircleIcon,
  MessageIcon, BellIcon, AiIcon, CalendarIcon, BarChartIcon,
} from '@/components/Icons'

export const ICT_FEATURE_GROUPS: FeatureGroup[] = [
  { name: 'Main', items: [
    { id: 'chat',          label: 'Messages',      href: '/dashboard/ict/chat',          Icon: MessageIcon },
    { id: 'ai',            label: 'AI Assistant',  href: '/dashboard/ict/ai',             Icon: AiIcon },
    { id: 'notifications', label: 'Notifications', href: '/dashboard/ict/notifications',  Icon: BellIcon },
  ]},
  { name: 'Support', items: [
    { id: 'tickets',  label: 'Tickets',           href: '/dashboard/ict/tickets',          Icon: ClipboardIcon },
    { id: 'accounts', label: 'Account Requests',  href: '/dashboard/ict/account-requests',  Icon: UserIcon },
    { id: 'analytics', label: 'Analytics',        href: '/dashboard/ict/analytics',         Icon: BarChartIcon },
    { id: 'meetings', label: 'Meetings',           href: '/dashboard/ict/meetings',          Icon: CalendarIcon },
  ]},
  { name: 'Infrastructure', items: [
    { id: 'assets', label: 'Assets & Devices', href: '/dashboard/ict/assets', Icon: ActivityIcon },
  ]},
  { name: 'Onboarding', items: [
    { id: 'applications', label: 'Applications', href: '/dashboard/ict/applications', Icon: CheckCircleIcon },
  ]},
  { name: 'Account', items: [
    { id: 'profile', label: 'My Profile', href: '/dashboard/ict/profile', Icon: UserIcon },
  ]},
]
