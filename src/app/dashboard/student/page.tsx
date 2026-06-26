import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StudentDashboardClient from './StudentDashboardClient'

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

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'student') redirect('/login')

  const school = (profile as any)?.schools ?? null

  // FIX: class_id lives in student_profiles, not profiles
  const { data: sp } = await supabase
    .from('student_profiles')
    .select('class_id')
    .eq('id', user.id)
    .single()

  const classId     = sp?.class_id ?? null
  const currentTerm = getCurrentTerm()  // FIX: 'First Term' / 'Second Term' / 'Third Term'
  const currentYear = getCurrentYear()

  const [
    { count: pendingTasks },
    { count: upcomingQuizzes },
    { data: liveClass },
    { count: notifications },
    { data: attendanceRows },
    { data: resultRows },
    { data: leaderboardRows },
  ] = await Promise.all([
    supabase.from('assignments')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', profile.school_id)
      .eq('class_id', classId)           // FIX: from student_profiles
      .eq('status', 'active'),

    supabase.from('quizzes')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', profile.school_id)
      .eq('class_id', classId)           // FIX: from student_profiles
      .lte('starts_at', new Date().toISOString())
      .gte('ends_at',   new Date().toISOString()),

    // FIX: online_classes uses is_live boolean, not status = 'live'
    // FIX: .limit(1) instead of .single() — .single() throws when no live class
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

    // FIX: term value now matches DB enum
    supabase.from('results')
      .select('score, max_score')
      .eq('student_id', user.id)
      .eq('school_id', profile.school_id)
      .eq('term', currentTerm)
      .eq('academic_year', currentYear)
      .eq('approved', true),

    // FIX: class_id from student_profiles, term value corrected
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

  // Attendance %
  const totalDays   = attendanceRows?.length ?? 0
  const presentDays = attendanceRows?.filter(r =>
    r.status === 'present' || (!r.status && r.is_present === true)
  ).length ?? 0
  const attendance  = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : null

  // GPA on 5.0 scale
  const valid = resultRows?.filter(r => r.score != null && (r.max_score ?? 0) > 0) ?? []
  const gpa   = valid.length > 0
    ? Math.round(((valid.reduce((s, r) => s + (r.score! / r.max_score), 0) / valid.length) * 5) * 10) / 10
    : null

  // Class rank
  const rankPos = leaderboardRows?.findIndex(r => r.student_id === user.id) ?? -1
  const rank    = rankPos >= 0 ? rankPos + 1 : null

  // Background trial check
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
        pendingTasks:    pendingTasks    ?? 0,
        upcomingQuizzes: upcomingQuizzes ?? 0,
        isLive:          (liveClass?.length ?? 0) > 0,  // FIX: was !!liveClass which is always true
        notifications:   notifications  ?? 0,
        attendance,
        gpa,
        rank,
      }}
    />
  )
}
