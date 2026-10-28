import { getAuthUser } from '@/lib/supabase/authUser'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MedicationsClient from './MedicationsClient'

export default async function MedicationsPage() {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', user.id).single()

  const school = (profile as any)?.schools ?? null
  return <MedicationsClient profile={profile} school={school} userId={user.id} />
}
