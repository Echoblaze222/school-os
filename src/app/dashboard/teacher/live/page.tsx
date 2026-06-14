import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LiveClient from './LiveClient'
export default async function LivePage() {
  const supabase =await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*, schools(*)').eq('id', user.id).single()
  const school = (profile as any)?.schools ?? null
  return <LiveClient profile={profile} school={school} userId={user.id} />
}
