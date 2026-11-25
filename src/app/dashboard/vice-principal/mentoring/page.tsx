// src/app/dashboard/vice-principal/mentoring/page.tsx
import { getAuthUser } from '@/lib/supabase/authUser'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import VicePrincipalMentoringClient from './VicePrincipalMentoringClient'

export const metadata = { title: 'Peer Mentoring | SchoolOS' }

export default async function VicePrincipalMentoringPage() {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  if ((profile as any)?.role !== 'vice-principal') redirect('/dashboard')

  const school = (profile as any)?.schools ?? null

  return <VicePrincipalMentoringClient profile={profile} school={school} userId={user.id} />
}
