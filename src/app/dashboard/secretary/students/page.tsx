// src/app/dashboard/secretary/students/page.tsx
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import StudentsClient from './StudentsClient'

export default async function StudentsPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll(c: any[]) { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'secretary') redirect('/login')
  const { data: school } = await supabase.from('schools').select('*').eq('id', profile.school_id).single()

  const [{ data: students }, { data: classes }] = await Promise.all([
    supabase.from('profiles')
      .select('id, full_name, admission_number, class_id, onboarding_stage, created_at, email')
      .eq('school_id', profile.school_id)
      .eq('role', 'student')
      .order('created_at', { ascending: false }),
    supabase.from('classes').select('id, name').eq('school_id', profile.school_id).order('name'),
  ])

  // Attach class names
  const classMap: Record<string, string> = {}
  classes?.forEach((c: any) => { classMap[c.id] = c.name })
  const enriched = (students ?? []).map((s: any) => ({ ...s, class_name: s.class_id ? classMap[s.class_id] : undefined }))

  return (
    <StudentsClient
      students={enriched}
      profile={profile}
      school={school}
      userId={user.id}
      classes={classes ?? []}
    />
  )
}
