import { getAuthUser } from '@/lib/supabase/authUser'
import { redirect } from 'next/navigation'
import RecordingsLibrary from '@/components/live/RecordingsLibrary'

export default async function StudentRecordingsPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')
  return <RecordingsLibrary />
}
