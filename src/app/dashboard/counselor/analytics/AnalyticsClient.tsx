'use client'
import RoleSubHeader from '@/components/RoleSubHeader'
import RoleAnalyticsPanel from '@/components/analytics/RoleAnalyticsPanel'
import { COUNSELOR_FEATURE_GROUPS } from '../featureGroups'

const RANGES = [{ days: 60, label: '60 days' }, { days: 120, label: '4 months' }, { days: 365, label: '1 year' }]

export default function AnalyticsClient({ profile, school, userId }: { profile: any; school: any; userId: string }) {
  return (
    <RoleSubHeader userId={userId} role="counselor" profile={profile} school={school} title="Analytics" featureGroups={COUNSELOR_FEATURE_GROUPS}>
      <RoleAnalyticsPanel rpc="counselor_analytics" ranges={RANGES} defaultDays={120} brand={school?.primary_color ?? '#800020'} />
    </RoleSubHeader>
  )
}
