import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AssignmentsClient from './AssignmentsClient'

export default async function PrincipalAssignmentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', user.id).single()
  if (!profile || (profile as any).role !== 'principal') redirect('/login')
  const school = (profile as any)?.schools ?? null
  return <AssignmentsClient profile={profile} school={school} userId={user.id} />
}
