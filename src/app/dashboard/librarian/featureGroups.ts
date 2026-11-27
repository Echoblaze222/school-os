// src/app/dashboard/librarian/featureGroups.ts
// Shared across every librarian sub-page that uses RoleSubHeader.

import { FeatureGroup } from '@/components/AllFeaturesSheet'
import { BookIcon, RefreshIcon, AiIcon, MessageIcon, BellIcon, UserIcon, CalendarIcon, BarChartIcon } from '@/components/Icons'

export const LIBRARIAN_FEATURE_GROUPS: FeatureGroup[] = [
  { name: 'Library', items: [
    { id: 'catalog',   label: 'Catalog',   href: '/dashboard/librarian/catalog',   Icon: BookIcon },
    { id: 'checkouts', label: 'Checkouts', href: '/dashboard/librarian/checkouts', Icon: RefreshIcon },
    { id: 'analytics', label: 'Analytics', href: '/dashboard/librarian/analytics', Icon: BarChartIcon },
    { id: 'meetings',  label: 'Meetings',  href: '/dashboard/librarian/meetings',  Icon: CalendarIcon },
  ]},
  { name: 'Communication', items: [
    { id: 'chat',          label: 'Messages',      href: '/dashboard/librarian/chat',          Icon: MessageIcon },
    { id: 'notifications', label: 'Notifications', href: '/dashboard/librarian/notifications', Icon: BellIcon },
  ]},
  { name: 'Account', items: [
    { id: 'ai',      label: 'AI Assistant', href: '/dashboard/librarian/ai',      Icon: AiIcon },
    { id: 'profile', label: 'My Profile',   href: '/dashboard/librarian/profile', Icon: UserIcon },
  ]},
]
