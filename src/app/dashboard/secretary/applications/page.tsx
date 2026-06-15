// src/app/dashboard/secretary/applications/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ApplicationsClient from './ApplicationsClient'

export default async function ApplicationsPage() {
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

  const { data: applications } = await supabase
    .from('applications')
    .select('*')
    .eq('school_id', profile.school_id)
    .order('created_at', { ascending: false })

  return <ApplicationsClient applications={applications ?? []} profile={profile} school={school} userId={user.id} />
    }
    
