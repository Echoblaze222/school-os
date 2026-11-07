'use client'
import RoleSubHeader from '@/components/RoleSubHeader'
import StudentProgressPanel from '@/components/analytics/StudentProgressPanel'
import { STUDENT_FEATURE_GROUPS } from '../featureGroups'

export default function AnalyticsClient({ profile, school, userId }: { profile: any; school: any; userId: string }) {
  return (
    <RoleSubHeader userId={userId} role="student" profile={profile} school={school} title="My progress" featureGroups={STUDENT_FEATURE_GROUPS}>
      <StudentProgressPanel audience="student" brand={school?.primary_color ?? '#800020'} />
    </RoleSubHeader>
  )
}
