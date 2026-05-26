import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ApplicationsClient from './ApplicationsClient'
export default async function ApplicationsPage() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*, schools(*)').eq('id', session.user.id).single()
  const school = (profile as any)?.schools ?? null
  return <ApplicationsClient profile={profile} school={school} userId={session.user.id} />
}
