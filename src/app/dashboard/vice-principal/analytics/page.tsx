import { requireAnalyticsAccess } from '@/lib/analyticsAccess'
import AnalyticsClient from './AnalyticsClient'

// Vice principal is an appointment (teacher or principal base role). Academics + attendance only; finance stays principal/bursar.
export default async function Page() {
  const { userId, profile, school } = await requireAnalyticsAccess([], ['vice_principal'])
  return <AnalyticsClient profile={profile} school={school} userId={userId} />
}
