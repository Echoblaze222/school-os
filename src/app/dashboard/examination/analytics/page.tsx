import { requireAnalyticsAccess } from '@/lib/analyticsAccess'
import AnalyticsClient from './AnalyticsClient'

export default async function Page() {
  const { userId, profile, school } = await requireAnalyticsAccess(['principal'], ['examination_officer', 'examination_coordinator', 'examination_secretary', 'exam_setter', 'invigilator'])
  return <AnalyticsClient profile={profile} school={school} userId={userId} />
}
