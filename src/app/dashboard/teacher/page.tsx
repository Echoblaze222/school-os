// src/app/dashboard/teacher/page.tsx
// FIX #4: Now fetches real counts for stats cards

import { createClient }       from '@/lib/supabase/server'
import { redirect }           from 'next/navigation'
import { checkSubscription }  from '@/lib/subscription'
import SubscriptionGate       from '@/components/SubscriptionGate'
import TeacherDashboardClient from './TeacherDashboardClient'

export default async function TeacherDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const userId = user.id

  // ── Subscription check (before any other data fetching) ──────────────────
  const sub = await checkSubscription(userId)
  if (sub.locked) {
    return (
      <SubscriptionGate
        schoolName={sub.schoolName}
        schoolColor={sub.schoolColor}
        status={sub.status as any}
      />
    )
  }

  // ── Profile + school (single query) ──────────────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', userId)
    .single()

  if (!profile || profile.role !== 'teacher') redirect('/login')

  const school = (profile as any)?.schools ?? null

  // ── Parallel count queries ────────────────────────────────────────────────
  const [
    { count: classCount },
    { count: assignmentCount },
    { count: pendingGrading },
    { count: quizCount },
  ] = await Promise.all([
    supabase
      .from('class_teachers')
      .select('*', { count: 'exact', head: true })
      .eq('teacher_id', userId)
      .eq('school_id', school?.id),

    supabase
      .from('assignments')
      .select('*', { count: 'exact', head: true })
      .eq('teacher_id', userId)
      .eq('school_id', school?.id)
      .gte('due_date', new Date().toISOString()),

    supabase
      .from('assignment_submissions')
      .select('assignments!inner(*)', { count: 'exact', head: true })
      .eq('assignments.teacher_id', userId)
      .eq('status', 'submitted'),

    supabase
      .from('quizzes')
      .select('*', { count: 'exact', head: true })
      .eq('teacher_id', userId)
      .eq('school_id', school?.id)
      .eq('status', 'published'),
  ])

  // Total students across all teacher's classes
  const { data: teacherClasses } = await supabase
    .from('class_teachers')
    .select('class_id')
    .eq('teacher_id', userId)
    .eq('school_id', school?.id)

  let studentCount = 0
  if (teacherClasses && teacherClasses.length > 0) {
    const classIds = teacherClasses.map((c: any) => c.class_id)
    const { count } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', school?.id)
      .eq('role', 'student')
      .in('class_id', classIds)
    studentCount = count ?? 0
  }

  const counts = {
    classCount:      classCount      ?? 0,
    studentCount,
    assignmentCount: assignmentCount ?? 0,
    pendingGrading:  pendingGrading  ?? 0,
    quizCount:       quizCount       ?? 0,
  }

  return (
    <TeacherDashboardClient
      profile={profile}
      school={school}
      userId={userId}
      counts={counts}
    />
  )
}
