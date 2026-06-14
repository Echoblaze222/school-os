// src/app/dashboard/teacher/page.tsx
// FIX #4: Now fetches real counts for stats cards

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TeacherDashboardClient from './TeacherDashboardClient'

export default async function TeacherDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const userId = user.id

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', userId)
    .single()

  const school = (profile as any)?.schools ?? null

  // ── Parallel count queries (FIX #4) ─────────────────────────
  const [
    { count: classCount },
    { count: assignmentCount },
    { count: pendingGrading },
    { count: quizCount },
  ] = await Promise.all([
    // How many classes is this teacher assigned to
    supabase
      .from('class_teachers')
      .select('*', { count: 'exact', head: true })
      .eq('teacher_id', userId)
      .eq('school_id', school?.id),

    // How many active assignments this teacher has created
    supabase
      .from('assignments')
      .select('*', { count: 'exact', head: true })
      .eq('teacher_id', userId)
      .eq('school_id', school?.id)
      .gte('due_date', new Date().toISOString()),

    // Submissions waiting to be graded
    supabase
      .from('assignment_submissions')
      .select('assignments!inner(*)', { count: 'exact', head: true })
      .eq('assignments.teacher_id', userId)
      .eq('status', 'submitted'),

    // Published quizzes
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
