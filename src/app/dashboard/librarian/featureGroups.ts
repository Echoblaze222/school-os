// src/app/dashboard/librarian/featureGroups.ts
// Shared across every librarian sub-page that uses RoleSubHeader, so the
// bottom dock / "all features" sheet is identical everywhere a librarian
// navigates - not just on the dashboard home screen. Extracted from
// LibrarianDashboardClient.tsx, which now imports this instead of
// defining its own local copy.

import { FeatureGroup } from '@/components/AllFeaturesSheet'
import { BookIcon, RefreshIcon, AiIcon, MessageIcon, BellIcon, UserIcon, CalendarIcon } from '@/components/Icons'

export const LIBRARIAN_FEATURE_GROUPS: FeatureGroup[] = [
  { name: 'Library', items: [
    { id: 'catalog',   label: 'Catalog',   href: '/dashboard/librarian/catalog',   Icon: BookIcon },
    { id: 'checkouts', label: 'Checkouts', href: '/dashboard/librarian/checkouts', Icon: RefreshIcon },
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
