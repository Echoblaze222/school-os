'use client'
import RoleSubHeader from '@/components/RoleSubHeader'
import RoleAnalyticsPanel from '@/components/analytics/RoleAnalyticsPanel'
import { COACH_FEATURE_GROUPS } from '../featureGroups'

export default function AnalyticsClient({ profile, school, userId }: { profile: any; school: any; userId: string }) {
  return (
    <RoleSubHeader userId={userId} role="coach" profile={profile} school={school} title="Analytics" featureGroups={COACH_FEATURE_GROUPS}>
      <RoleAnalyticsPanel rpc="coach_analytics" brand={school?.primary_color ?? '#800020'} />
    </RoleSubHeader>
  )
}
