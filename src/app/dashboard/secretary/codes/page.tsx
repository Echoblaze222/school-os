// src/app/dashboard/secretary/codes/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CodesClient from './CodesClient'

export default async function CodesPage() {
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

  const { data: entries } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, default_code, is_active, created_at')
    .eq('school_id', profile.school_id)
    .eq('is_active', true)
    .order('role')
    .order('full_name')

  return <CodesClient entries={entries ?? []} profile={profile} school={school} userId={user.id} />
}
