// src/app/dashboard/hostel/featureGroups.ts
// Shared across every hostel sub-page that uses RoleSubHeader.

import { FeatureGroup } from '@/components/AllFeaturesSheet'
import {
  LayersIcon, CheckCircleIcon, AlertCircleIcon, AlertIcon,
  CalendarIcon, MessageIcon, AiIcon, BellIcon, UserIcon, BarChartIcon,
} from '@/components/Icons'

export const HOSTEL_FEATURE_GROUPS: FeatureGroup[] = [
  { name: 'Main', items: [
    { id: 'chat',          label: 'Messages',      href: '/dashboard/hostel/chat',          Icon: MessageIcon },
    { id: 'ai',            label: 'AI Assistant',  href: '/dashboard/hostel/ai',             Icon: AiIcon },
    { id: 'notifications', label: 'Notifications', href: '/dashboard/hostel/notifications',  Icon: BellIcon },
  ]},
  { name: 'Hostel', items: [
    { id: 'rooms',       label: 'Rooms & beds',   href: '/dashboard/hostel/rooms',       Icon: LayersIcon },
    { id: 'rollcall',    label: 'Roll call',      href: '/dashboard/hostel/roll-call',   Icon: CheckCircleIcon },
    { id: 'leave',       label: 'Leave requests', href: '/dashboard/hostel/leave',       Icon: CalendarIcon },
    { id: 'incidents',   label: 'Incidents',      href: '/dashboard/hostel/incidents',   Icon: AlertIcon },
    { id: 'maintenance', label: 'Maintenance',    href: '/dashboard/hostel/maintenance', Icon: AlertCircleIcon },
    { id: 'analytics',   label: 'Analytics',      href: '/dashboard/hostel/analytics',   Icon: BarChartIcon },
    { id: 'meetings',    label: 'Meetings',       href: '/dashboard/hostel/meetings',    Icon: CalendarIcon },
  ]},
  { name: 'Account', items: [
    { id: 'profile', label: 'My Profile', href: '/dashboard/hostel/profile', Icon: UserIcon },
  ]},
]
