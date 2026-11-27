'use client'
import RoleSubHeader from '@/components/RoleSubHeader'
import RoleAnalyticsPanel from '@/components/analytics/RoleAnalyticsPanel'
import { SECRETARY_FEATURE_GROUPS } from '../featureGroups'

const RANGES = [{ days: 30, label: '30 days' }, { days: 90, label: '90 days' }, { days: 180, label: '6 months' }]

export default function AnalyticsClient({ profile, school, userId }: { profile: any; school: any; userId: string }) {
  return (
    <RoleSubHeader userId={userId} role="secretary" profile={profile} school={school} title="Analytics" featureGroups={SECRETARY_FEATURE_GROUPS}>
      <RoleAnalyticsPanel rpc="secretary_analytics" ranges={RANGES} defaultDays={90} brand={school?.primary_color ?? '#800020'} />
    </RoleSubHeader>
  )
}
