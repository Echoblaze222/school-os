// src/app/dashboard/examination/profile/page.tsx
import { getExamContext } from '@/lib/supabase/getExamContext'
import ProfileClient from './ProfileClient'

export default async function ExaminationProfilePage() {
  const { profile, school, userId } = await getExamContext()
  return <ProfileClient profile={profile} school={school} userId={userId} />
}
