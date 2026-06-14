// src/app/dashboard/secretary/admissions/page.tsx
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import AdmissionsClient from './AdmissionsClient'

export default async function AdmissionsPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll(c: any[]) { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'secretary') redirect('/login')
  const { data: school } = await supabase.from('school_branding').select('*').eq('id', profile.school_id).single()

  const [{ data: admissions }, { data: classes }] = await Promise.all([
    supabase.from('admissions').select('*').eq('school_id', profile.school_id).order('applied_at', { ascending: false }),
    supabase.from('classes').select('id, name').eq('school_id', profile.school_id).order('name'),
  ])

  return <AdmissionsClient admissions={admissions ?? []} profile={profile} school={school} userId={user.id} classes={classes ?? []} />
}
