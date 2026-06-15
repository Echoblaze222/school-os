// src/app/dashboard/secretary/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SecretaryClient from './SecretaryClient'

export default async function SecretaryPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'secretary') redirect('/login')

  const school   = (profile as any)?.schools ?? null
  const schoolId = profile.school_id

  const [students, apps, weekly, users] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId).eq('role', 'student'),
    supabase.from('admissions').select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId).eq('status', 'pending'),
    supabase.from('profiles').select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId).eq('role', 'student')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    supabase.from('profiles').select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId).eq('is_active', true),
  ])

  const counts = {
    totalStudents : students.count ?? 0,
    pendingApps   : apps.count    ?? 0,
    newThisWeek   : weekly.count  ?? 0,
    activeUsers   : users.count   ?? 0,
  }

  return (
    <SecretaryClient
      profile={profile}
      school={school}
      userId={user.id}
      counts={counts}
    />
  )
}
