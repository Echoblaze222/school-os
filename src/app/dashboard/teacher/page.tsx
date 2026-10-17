// src/app/dashboard/teacher/page.tsx
// FIX #4: Now fetches real counts for stats cards

import { createClient }       from '@/lib/supabase/server'
import { redirect }           from 'next/navigation'
import { checkSubscription }  from '@/lib/subscription'
import SubscriptionGate       from '@/components/SubscriptionGate'
import TeacherDashboardClient from './TeacherDashboardClient'
import { getAuthedProfile }   from '@/lib/auth/getAuthedProfile'
import { EXAM_APPOINTMENT_TYPES, APPOINTMENT_TYPES } from '@/lib/supabase/appointments-types'

export default async function TeacherDashboardPage() {
  // Shared with teacher/layout.tsx (runs on this same request, just
  // before this page) via React's cache() - see
  // src/lib/auth/getAuthedProfile.ts. Was this page's own separate
  // auth.getUser() + profile/schools(*) query, duplicating exactly what
  // the layout above it already fetched on every navigation.
  const { user, profile, school } = await getAuthedProfile()
  if (!user) redirect('/login')
  if (!profile || profile.role !== 'teacher') redirect('/login')

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

  const supabase = await createClient()

  // ── Parallel queries ──────────────────────────────────────────────────────
  // examAppointment and recent_activities were previously separate,
  // sequential awaits (one before this block, one after) - neither
  // depends on the other 4 count queries or on each other, so folded in
  // here to run alongside them instead of adding two more full round
  // trips on top.
  const [
    { count: classCount },
    { count: assignmentCount },
    { count: pendingGrading },
    { count: quizCount },
    { data: examAppointment },
    { data: activityRows },
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

    // Exam-committee appointment (Phase 2, Lane C) - only used to decide
    // whether to show the "Examination Team" link on this dashboard,
    // actual access control for /dashboard/examination lives in that
    // route's own layout.tsx, this is discoverability only, not a
    // security boundary.
    supabase
      .from('appointments')
      .select('appointment_type')
      .eq('profile_id', userId)
      .eq('status', 'active')
      .in('appointment_type', EXAM_APPOINTMENT_TYPES)
      .limit(1)
      .maybeSingle(),

    supabase
      .from('recent_activities')
      .select('id, type, title, subtitle, href, metadata, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(15),
  ])

  const examAppointmentLabel = examAppointment
    ? APPOINTMENT_TYPES[examAppointment.appointment_type as keyof typeof APPOINTMENT_TYPES]?.label ?? null
    : null

  // Total students across all teacher's classes - genuinely sequential:
  // studentCount's query depends on the class ids returned by
  // teacherClasses, so this can't be folded into the batch above without
  // restructuring the query itself.
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

  const activities = (activityRows ?? []).map(row => ({
    id:         row.id,
    type:       row.type,
    title:      row.title,
    subtitle:   row.subtitle ?? undefined,
    href:       row.href,
    created_at: row.created_at,
    preview: row.metadata
      ? {
          body: row.metadata.body,
          meta: row.metadata.meta,
        }
      : undefined,
  }))

  return (
    <TeacherDashboardClient
      profile={profile}
      school={school}
      userId={userId}
      counts={counts}
      activities={activities}
      examAppointmentLabel={examAppointmentLabel}
    />
  )
}
