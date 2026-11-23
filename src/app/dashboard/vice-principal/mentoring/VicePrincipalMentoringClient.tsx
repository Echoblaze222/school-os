'use client'
// src/app/dashboard/vice-principal/mentoring/VicePrincipalMentoringClient.tsx
import StaffMentoringClient from '@/components/mentoring/StaffMentoringClient'
import { VP_FEATURE_GROUPS } from '../featureGroups'

// The vice-principal area has a chat list but no /chat/[roomId] page, so "Read chat" opens the list,
// where the mentoring room shows up because the approving staff member is its admin.
export default function VicePrincipalMentoringClient(props: { profile: any; school: any; userId: string }) {
  return (
    <StaffMentoringClient {...props} role="vice-principal"
      featureGroups={VP_FEATURE_GROUPS}
      roomHref={() => '/dashboard/vice-principal/chat'} />
  )
}
