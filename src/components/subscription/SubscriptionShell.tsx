'use client'

// src/components/subscription/SubscriptionShell.tsx
//
// Puts a subscription page inside the same dashboard layout (header, menu,
// dock, school colours) as every other page for that role. Client component
// because the feature groups hold icon components, which cannot be passed
// down from a server page.

import RoleSubHeader from '@/components/RoleSubHeader'
import { PRINCIPAL_FEATURE_GROUPS } from '@/app/dashboard/principal/featureGroups'
import { TEACHER_FEATURE_GROUPS } from '@/app/dashboard/teacher/featureGroups'
import { BURSAR_FEATURE_GROUPS } from '@/app/dashboard/bursar/featureGroups'
import { PARENT_FEATURE_GROUPS } from '@/app/dashboard/parent/featureGroups'
import { STUDENT_FEATURE_GROUPS } from '@/app/dashboard/student/featureGroups'

const GROUPS = {
  principal: PRINCIPAL_FEATURE_GROUPS,
  teacher: TEACHER_FEATURE_GROUPS,
  bursar: BURSAR_FEATURE_GROUPS,
  parent: PARENT_FEATURE_GROUPS,
  student: STUDENT_FEATURE_GROUPS,
} as const

interface Props {
  role: keyof typeof GROUPS
  userId: string
  profile: any
  school: any
  title: string
  children: React.ReactNode
}

export default function SubscriptionShell({ role, userId, profile, school, title, children }: Props) {
  return (
    <RoleSubHeader
      userId={userId} role={role} profile={profile} school={school}
      title={title} featureGroups={GROUPS[role]}
    >
      <div style={{ maxWidth: 640, margin: '0 auto', padding: 'var(--space-5, 20px)', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {children}
        <div style={{ height: 100 }} />
      </div>
    </RoleSubHeader>
  )
}
