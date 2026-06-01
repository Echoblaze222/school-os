import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TimetableClient from './TimetableClient'
export default async function TimetablePage() {
  const supabase =await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*, schools(*)').eq('id', session.user.id).single()
  const school = (profile as any)?.schools ?? null
  return <TimetableClient profile={profile} school={school} userId={session.user.id} />
}
