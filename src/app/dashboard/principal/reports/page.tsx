// src/app/dashboard/principal/reports/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ReportsClient from './ReportsClient'

export default async function ReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', user.id).single()

  if (!profile || profile.role !== 'principal') redirect('/login')

  const school = (profile as any)?.schools ?? null
  return <ReportsClient profile={profile} school={school} userId={user.id} />
}
