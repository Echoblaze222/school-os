'use client'
// src/app/dashboard/principal/mentoring/PrincipalMentoringClient.tsx
import StaffMentoringClient from '@/components/mentoring/StaffMentoringClient'
import { PRINCIPAL_FEATURE_GROUPS } from '../featureGroups'

export default function PrincipalMentoringClient(props: { profile: any; school: any; userId: string }) {
  return (
    <StaffMentoringClient {...props} role="principal"
      featureGroups={PRINCIPAL_FEATURE_GROUPS} chatBase="/dashboard/principal/chat" />
  )
}
