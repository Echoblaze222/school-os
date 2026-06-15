// src/app/dashboard/secretary/students/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StudentsClient from './StudentsClient'

export default async function StudentsPage() {
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

  const [{ data: students }, { data: classes }] = await Promise.all([
    supabase.from('profiles')
      .select('id, full_name, admission_number, class_id, onboarding_stage, created_at, email')
      .eq('school_id', profile.school_id)
      .eq('role', 'student')
      .order('created_at', { ascending: false }),
    supabase.from('classes').select('id, name').eq('school_id', profile.school_id).order('name'),
  ])

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
