'use client'
import RoleSubHeader from '@/components/RoleSubHeader'
import StudentProgressPanel from '@/components/analytics/StudentProgressPanel'
import { PARENT_FEATURE_GROUPS } from '../featureGroups'

export default function AnalyticsClient({ profile, school, userId }: { profile: any; school: any; userId: string }) {
  return (
    <RoleSubHeader userId={userId} role="parent" profile={profile} school={school} title="Progress" featureGroups={PARENT_FEATURE_GROUPS}>
      <StudentProgressPanel audience="parent" brand={school?.primary_color ?? '#800020'} />
    </RoleSubHeader>
  )
}
