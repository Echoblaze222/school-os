import { requireAnalyticsAccess } from '@/lib/analyticsAccess'
import AnalyticsClient from './AnalyticsClient'

export default async function Page() {
  const { userId, profile, school } = await requireAnalyticsAccess(['principal', 'secretary'], ['warden', 'assistant_warden', 'house_parent', 'hostel_administrator'])
  return <AnalyticsClient profile={profile} school={school} userId={userId} />
}
