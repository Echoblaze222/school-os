// src/app/dashboard/secretary/applications/page.tsx
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import ApplicationsClient from './ApplicationsClient'

export default async function ApplicationsPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll() { return cookieStore.getAll() }, setAll(c: any[]) { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } } })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'secretary') redirect('/login')
  const { data: school } = await supabase.from('schools').select('*').eq('id', profile.school_id).single()
  const { data: applications } = await supabase.from('applications').select('*').eq('school_id', profile.school_id).order('created_at', { ascending: false })
  return <ApplicationsClient applications={applications ?? []} profile={profile} school={school} userId={user.id} />
}
