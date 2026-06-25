import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StudentDashboardClient from './StudentDashboardClient'

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

  // Current term helper (Nigerian academic calendar: Term 1 Sep-Dec, Term 2 Jan-Apr, Term 3 May-Aug)
  const now = new Date()
  const month = now.getMonth() + 1
  const currentTerm = month >= 9 ? 'first' : month >= 5 ? 'third' : 'second'
  const currentYear = month >= 9
    ? `${now.getFullYear()}/${now.getFullYear() + 1}`
    : `${now.getFullYear() - 1}/${now.getFullYear()}`

  // Parallel data fetch
  const [
    { count: pendingTasks },
    { count: upcomingQuizzes },
    { data: liveClass },
    { count: notifications },
    // ATTENDANCE: count present days vs total marked days this term
    { data: attendanceRows },
    // GPA: avg score from approved results this term
    { data: resultRows },
    // RANK: student position from leaderboard table
    { data: leaderboardRows },
  ] = await Promise.all([
    // BUG 11 FIX: assignments are tied to classes, not directly to student_id
    supabase.from('assignments')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', profile?.school_id)
      .eq('class_id', profile?.class_id)
      .eq('status', 'active'),
    // QUIZ FIX: count quizzes that are currently live
    supabase.from('quizzes')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', profile?.school_id)
      .eq('class_id', profile?.class_id)
      .lte('starts_at', new Date().toISOString())
      .gte('ends_at',   new Date().toISOString()),
    supabase.from('online_classes')
      .select('id')
      .eq('school_id', profile?.school_id)
      .eq('class_id', profile?.class_id)
      .eq('status', 'live')
      .single(),
    supabase.from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false),
    // Real attendance — only columns needed for rate calc
    supabase.from('attendance')
      .select('status, is_present')
      .eq('student_id', user.id)
      .eq('school_id', profile?.school_id),
    // Real results — score + max_score for GPA calc
    supabase.from('results')
      .select('score, max_score')
      .eq('student_id', user.id)
      .eq('school_id', profile?.school_id)
      .eq('term', currentTerm)
      .eq('academic_year', currentYear)
      .eq('approved', true),
    // Leaderboard for rank — fetch whole class sorted desc so we can find position
    supabase.from('student_leaderboard')
      .select('student_id, total_points')
      .eq('class_id', profile?.class_id)
      .eq('term', currentTerm)
      .eq('academic_year', currentYear)
      .order('total_points', { ascending: false }),
  ])

  // Compute attendance %
  const totalDays    = attendanceRows?.length ?? 0
  const presentDays  = attendanceRows?.filter(r => r.status === 'present' || (!r.status && r.is_present)).length ?? 0
  const attendance   = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : null

  // Compute GPA (avg percentage mapped to 5.0 scale)
  const validResults = resultRows?.filter(r => r.score != null && r.max_score > 0) ?? []
  const gpa = validResults.length > 0
    ? Math.round(((validResults.reduce((s, r) => s + (r.score! / r.max_score), 0) / validResults.length) * 5) * 10) / 10
    : null

  // Compute rank — find student position in sorted leaderboard
  const rankPos = leaderboardRows?.findIndex(r => r.student_id === user.id)
  const rank = (rankPos != null && rankPos >= 0) ? rankPos + 1 : null

  // Trigger trial check in background
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
        isLive:          !!liveClass,
        notifications:   notifications  ?? 0,
        attendance,
        gpa,
        rank,
      }}
    />
  )
    }
    
