'use client'
import RoleSubHeader from '@/components/RoleSubHeader'
import RoleAnalyticsPanel from '@/components/analytics/RoleAnalyticsPanel'
import { ICT_FEATURE_GROUPS } from '../featureGroups'

const RANGES = [{ days: 30, label: '30 days' }, { days: 90, label: '90 days' }, { days: 180, label: '6 months' }]

export default function AnalyticsClient({ profile, school, userId }: { profile: any; school: any; userId: string }) {
  return (
    <RoleSubHeader userId={userId} role="ict" profile={profile} school={school} title="Analytics" featureGroups={ICT_FEATURE_GROUPS}>
      <RoleAnalyticsPanel rpc="ict_analytics" ranges={RANGES} defaultDays={90} brand={school?.primary_color ?? '#800020'} />
    </RoleSubHeader>
  )
}
