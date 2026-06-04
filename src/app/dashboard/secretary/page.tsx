// src/app/dashboard/secretary/page.tsx
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import SecretaryClient from './SecretaryClient'

export default async function SecretaryPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(c: any[]) { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'secretary') redirect('/login')

  const { data: school } = await supabase
    .from('schools')
    .select('*')
    .eq('id', profile.school_id)
    .single()

  // Aggregate counts
  const schoolId = profile.school_id
  const [students, apps, weekly, users] = await Promise.all([
    supabase.from('student_profiles').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    supabase.from('admissions').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'pending'),
    supabase.from('student_profiles').select('id', { count: 'exact', head: true }).eq('school_id', schoolId)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('is_active', true),
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
