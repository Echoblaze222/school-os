import { getAuthUser } from '@/lib/supabase/authUser'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ExpensesClient from './ExpensesClient'

export default async function ExpensesPage() {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles')
    .select('*, schools(*)').eq('id', user.id).single()
  const school = (profile as any)?.schools ?? null
  return <ExpensesClient profile={profile} school={school} userId={user.id} />
}