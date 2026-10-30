import { requireAnalyticsAccess } from '@/lib/analyticsAccess'
import AnalyticsClient from './AnalyticsClient'

// Counselor is an appointment on top of the teacher base role; the data is limited to the caller's own caseload in SQL.
export default async function Page() {
  const { userId, profile, school } = await requireAnalyticsAccess([], ['counselor'])
  return <AnalyticsClient profile={profile} school={school} userId={userId} />
}
