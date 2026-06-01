import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import FeesClient from './FeesClient'
export default async function FeesPage() {
  const supabase =await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*, schools(*)').eq('id', session.user.id).single()
  const school = (profile as any)?.schools ?? null
  return <FeesClient profile={profile} school={school} userId={session.user.id} />
}
