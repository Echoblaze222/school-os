import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ResultsClient from './ResultsClient'
export default async function ResultsPage() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*, schools(*)').eq('id', session.user.id).single()
  const school = (profile as any)?.schools ?? null
  return <ResultsClient profile={profile} school={school} userId={session.user.id} />
}
