import { requireAnalyticsAccess } from '@/lib/analyticsAccess'
import AnalyticsClient from './AnalyticsClient'

export default async function Page() {
  const { userId, profile, school } = await requireAnalyticsAccess(['secretary'])
  return <AnalyticsClient profile={profile} school={school} userId={userId} />
}
