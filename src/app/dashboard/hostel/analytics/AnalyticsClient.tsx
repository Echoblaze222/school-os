'use client'
import RoleSubHeader from '@/components/RoleSubHeader'
import RoleAnalyticsPanel from '@/components/analytics/RoleAnalyticsPanel'
import { HOSTEL_FEATURE_GROUPS } from '../featureGroups'

const RANGES = [{ days: 14, label: '14 days' }, { days: 30, label: '30 days' }, { days: 90, label: '90 days' }]

export default function AnalyticsClient({ profile, school, userId }: { profile: any; school: any; userId: string }) {
  return (
    <RoleSubHeader userId={userId} role="hostel" profile={profile} school={school} title="Analytics" featureGroups={HOSTEL_FEATURE_GROUPS}>
      <RoleAnalyticsPanel rpc="hostel_analytics" ranges={RANGES} defaultDays={30} brand={school?.primary_color ?? '#800020'} />
    </RoleSubHeader>
  )
}
