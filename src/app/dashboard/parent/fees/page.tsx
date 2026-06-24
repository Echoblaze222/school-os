// src/app/dashboard/parent/fees/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import FeesClient from './FeesClient'

export default async function ParentFeesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  const school = (profile as any)?.schools ?? null
  return <FeesClient profile={profile} school={school} userId={user.id} />
}
