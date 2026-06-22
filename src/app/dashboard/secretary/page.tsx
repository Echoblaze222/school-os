// src/app/dashboard/secretary/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SecretaryClient from './SecretaryClient'

export default async function SecretaryPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // FIX: join schools(*) inline exactly like principal/page.tsx does
  // This is why logo, name and colour were missing — the separate schools query
  // was returning null due to RLS, so school was always null in DashboardHeader
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'secretary') redirect('/login')

  // school is now embedded in profile — no second round-trip needed
  const school   = (profile as any).schools ?? null
  const schoolId = profile.school_id

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [students, transfers, weekly, activeUsers] = await Promise.all([
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('role', 'student'),
    supabase
      .from('student_transfers')
      .select('id', { count: 'exact', head: true })
      .eq('origin_school_id', schoolId)
      .eq('status', 'requested'),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('role', 'student')
      .gte('created_at', weekAgo),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('is_active', true),
  ])

  const counts = {
    totalStudents: students.count    ?? 0,
    pendingApps:   transfers.count   ?? 0,
    newThisWeek:   weekly.count      ?? 0,
    activeUsers:   activeUsers.count ?? 0,
  }

  return <SecretaryClient profile={profile} school={school} userId={user.id} counts={counts} />
}
