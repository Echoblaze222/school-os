// src/app/dashboard/ict/featureGroups.ts
// Shared across every ict sub-page that uses RoleSubHeader, so the
// bottom dock / "all features" sheet is identical everywhere an ict
// staff member navigates - not just on the dashboard home screen.
// Extracted from IctClient.tsx, which now imports this instead of
// defining its own local copy.

import { FeatureGroup } from '@/components/AllFeaturesSheet'
import {
  ClipboardIcon, ActivityIcon, UserIcon, CheckCircleIcon,
  MessageIcon, BellIcon, AiIcon, CalendarIcon,
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
