import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SELF_PROFILE_SAFE_COLUMNS } from '@/lib/supabase/profileSelectors'
import PaymentsClient from './PaymentsClient'
export default async function PaymentsPage() {
  const supabase =await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select(`${SELF_PROFILE_SAFE_COLUMNS}, schools(*)`).eq('id', user.id).single()
  const school = (profile as any)?.schools ?? null
  return <PaymentsClient profile={profile} school={school} userId={user.id} />
}
