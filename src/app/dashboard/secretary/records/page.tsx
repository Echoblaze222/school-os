// src/app/dashboard/secretary/records/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import RecordsClient from './RecordsClient'

export default async function RecordsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'secretary') redirect('/login')
  const school = (profile as any)?.schools ?? null

  const { data: records } = await supabase
    .from('behaviour_records')
    .select('*')
    .eq('school_id', profile.school_id)
    .order('date', { ascending: false })

  return <RecordsClient records={records ?? []} profile={profile} school={school} userId={user.id} />
}
