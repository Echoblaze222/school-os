import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import RecordingsLibrary from '@/components/live/RecordingsLibrary'

export default async function TeacherRecordingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <RecordingsLibrary />
}
