// src/app/dashboard/coach/featureGroups.ts
// Shared across every coach sub-page that uses RoleSubHeader, so the
// bottom dock / "all features" sheet is identical everywhere a coach
// navigates - not just on the dashboard home screen. Extracted from
// CoachDashboardClient.tsx, which now imports this instead of defining
// its own local copy.

import { FeatureGroup } from '@/components/AllFeaturesSheet'
import { PeopleIcon, CalendarIcon, TrophyIcon, AiIcon, MessageIcon, BellIcon, UserIcon, ClipboardIcon } from '@/components/Icons'

export const COACH_FEATURE_GROUPS: FeatureGroup[] = [
  { name: 'Coaching', items: [
    { id: 'teams',    label: 'Teams',    href: '/dashboard/coach/teams',    Icon: PeopleIcon },
    { id: 'schedule', label: 'Schedule', href: '/dashboard/coach/schedule', Icon: CalendarIcon },
    { id: 'matches',  label: 'Matches',  href: '/dashboard/coach/matches',  Icon: TrophyIcon },
    { id: 'meetings', label: 'Meetings', href: '/dashboard/coach/meetings', Icon: ClipboardIcon },
  ]},
  { name: 'Communication', items: [
    { id: 'chat',          label: 'Messages',      href: '/dashboard/coach/chat',          Icon: MessageIcon },
    { id: 'notifications', label: 'Notifications', href: '/dashboard/coach/notifications', Icon: BellIcon },
  ]},
  { name: 'Account', items: [
    { id: 'ai',      label: 'AI Assistant', href: '/dashboard/coach/ai',      Icon: AiIcon },
    { id: 'profile', label: 'My Profile',   href: '/dashboard/coach/profile', Icon: UserIcon },
  ]},
]
