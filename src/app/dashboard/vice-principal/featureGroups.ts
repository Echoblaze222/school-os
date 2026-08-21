// src/app/dashboard/vice-principal/featureGroups.ts
// Shared "All features" list for the Vice Principal role - used by
// RoleHeroHeader (dashboard home) and RoleSubHeader (every other Vice
// Principal page) so the sheet stays identical everywhere instead of
// drifting per page. Same pattern as parent/featureGroups.ts.
//
// Kept to routes that actually exist - if a future lane adds more Vice
// Principal pages, add them here, not as a one-off in a single page.

import { FeatureGroup } from '@/components/AllFeaturesSheet'
import { LayersIcon, UsersIcon, BellIcon, UserIcon, MegaphoneIcon } from '@/components/Icons'

export const VP_FEATURE_GROUPS: FeatureGroup[] = [
  { name: 'Organization', items: [
    { id: 'departments',    label: 'Departments',    href: '/dashboard/vice-principal/departments',    Icon: LayersIcon },
    { id: 'staff',          label: 'Staff',          href: '/dashboard/vice-principal/staff',          Icon: UsersIcon },
    { id: 'announcements',  label: 'Announcements',  href: '/dashboard/vice-principal/announcements',  Icon: MegaphoneIcon },
  ]},
  { name: 'Account', items: [
    { id: 'notifications', label: 'Notifications', href: '/dashboard/vice-principal/notifications', Icon: BellIcon },
    { id: 'profile',       label: 'Profile',       href: '/dashboard/vice-principal/profile',       Icon: UserIcon },
  ]},
]
