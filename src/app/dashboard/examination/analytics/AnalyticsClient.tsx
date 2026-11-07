'use client'
import RoleSubHeader from '@/components/RoleSubHeader'
import RoleAnalyticsPanel from '@/components/analytics/RoleAnalyticsPanel'
import { EXAMINATION_FEATURE_GROUPS } from '../featureGroups'

export default function AnalyticsClient({ profile, school, userId }: { profile: any; school: any; userId: string }) {
  return (
    <RoleSubHeader userId={userId} role="examination" profile={profile} school={school} title="Analytics" featureGroups={EXAMINATION_FEATURE_GROUPS}>
      <RoleAnalyticsPanel rpc="exam_analytics" brand={school?.primary_color ?? '#800020'} />
    </RoleSubHeader>
  )
}
