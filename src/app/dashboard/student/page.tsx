// src/app/dashboard/student/page.tsx

import { createClient }        from '@/lib/supabase/server'
import { redirect }            from 'next/navigation'
import { checkSubscription }   from '@/lib/subscription'
import SubscriptionGate        from '@/components/SubscriptionGate'
import StudentDashboardClient  from './StudentDashboardClient'

function getCurrentTerm() {
  const m = new Date().getMonth() + 1
  if (m >= 9 || m <= 1) return 'First Term'
  if (m >= 5)           return 'Third Term'
  return 'Second Term'
}
function getCurrentYear() {
  const now = new Date(); const m = now.getMonth() + 1; const y = now.getFullYear()
  return m >= 9 ? `${y}/${y + 1}` : `${y - 1}/${y}`
}

export default async function StudentDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // ── Subscription check (before any other data fetching) ──────────────────
  const sub = await checkSubscription(user.id)
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
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'student') redirect('/login')

  const school = (profile as any)?.schools ?? null

  // class_id lives in student_profiles, not profiles
  const { data: sp } = await supabase
    .from('student_profiles')
    .select('class_id')
    .eq('id', user.id)
    .single()

  const classId     = sp?.class_id ?? null
  const currentTerm = getCurrentTerm()
  const currentYear = getCurrentYear()

  const [
    { data: allAssignments },
    { data: submittedAssignments },
    { count: upcomingQuizzes },
    { data: liveClass },
    { count: notifications },
    { data: attendanceRows },
    { data: resultRows },
    { data: leaderboardRows },
  ] = await Promise.all([
    supabase.from('assignments')
      .select('id')
      .eq('school_id', profile.school_id)
      .eq('class_id', classId)
      .eq('status', 'active'),

    supabase.from('assignment_submissions')
      .select('assignment_id')
      .eq('student_id', user.id),

    supabase.from('quizzes')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', profile.school_id)
      .eq('class_id', classId)
      .lte('starts_at', new Date().toISOString())
      .gte('ends_at',   new Date().toISOString()),

    supabase.from('online_classes')
      .select('id')
      .eq('school_id', profile.school_id)
      .eq('class_id', classId)
      .eq('is_live', true)
      .limit(1),

    supabase.from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false),

    supabase.from('attendance')
      .select('status, is_present')
      .eq('student_id', user.id)
      .eq('school_id', profile.school_id),

    supabase.from('results')
      .select('score, max_score')
      .eq('student_id', user.id)
      .eq('school_id', profile.school_id)
      .eq('term', currentTerm)
      .eq('academic_year', currentYear)
      .eq('approved', true),

    classId
      ? supabase.from('student_leaderboard')
          .select('student_id, total_points')
          .eq('class_id', classId)
          .eq('school_id', profile.school_id)
          .eq('term', currentTerm)
          .eq('academic_year', currentYear)
          .order('total_points', { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
  ])

  const submittedIds = new Set((submittedAssignments ?? []).map((s: any) => s.assignment_id))
  const pendingTasks = (allAssignments ?? []).filter((a: any) => !submittedIds.has(a.id)).length

  const totalDays   = attendanceRows?.length ?? 0
  const presentDays = attendanceRows?.filter((r: any) =>
    r.status === 'present' || (!r.status && r.is_present === true)
  ).length ?? 0
  const attendance  = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : null

  const valid = resultRows?.filter((r: any) => r.score != null && (r.max_score ?? 0) > 0) ?? []
  const gpa   = valid.length > 0
    ? Math.round(((valid.reduce((s: number, r: any) => s + (r.score / r.max_score), 0) / valid.length) * 5) * 10) / 10
    : null

  const rankPos = leaderboardRows?.findIndex((r: any) => r.student_id === user.id) ?? -1
  const rank    = rankPos >= 0 ? rankPos + 1 : null

  // ── Recent activities (last 15, most recent first) ─────────────────────────
  const { data: activityRows } = await supabase
    .from('recent_activities')
    .select('id, type, title, subtitle, href, metadata, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(15)

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

  if (school?.id && school?.setup_status === 'trial') {
    fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/trial/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schoolId: school.id }),
    }).catch(() => {})
  }

  return (
    <StudentDashboardClient
      profile={profile}
      school={school}
      userId={user.id}
      counts={{
        pendingTasks,
        upcomingQuizzes: upcomingQuizzes ?? 0,
        isLive:          (liveClass?.length ?? 0) > 0,
        notifications:   notifications ?? 0,
        attendance,
        gpa,
        rank,
      }}
      activities={activities}
    />
  )
}
