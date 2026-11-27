'use client'
// components/RoleNav.tsx
// Legacy navigation entry point still imported by RolePageWrapper and the
// pages that predate RoleSubHeader (notifications, report cards, universal
// chat, promote, alumni and others).
//
// It used to carry its own copy of every role's menu plus a desktop-only
// sidebar. That second copy drifted from each role's featureGroups.ts, so it
// now simply mounts the shared DesktopShell. Below 1024px it renders nothing
// visible, exactly as the old sidebar did (mobile navigation on these pages
// comes from their own dock or bottom bar).
//
// The props are kept as they were so no caller has to change.

import DesktopShell from './DesktopShell'

interface Props {
  userId: string
  profile: any
  school: any
  role: string
  schoolColor?: string
}

export default function RoleNav({ profile, school, role }: Props) {
  return <DesktopShell legacy role={role} profile={profile} school={school} />
}
