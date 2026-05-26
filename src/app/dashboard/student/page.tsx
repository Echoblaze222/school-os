import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StudentDashboardClient from './StudentDashboardClient'

export default async function StudentDashboardPage() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', session.user.id)
    .single()

  const school = (profile as any)?.schools ?? null

  // Parallel data fetch
  const [
    { count: pendingTasks },
    { count: upcomingQuizzes },
    { data: liveClass },
    { count: notifications },
  ] = await Promise.all([
    supabase.from('assignments')
      .select('*', { count: 'exact', head: true })
      .eq('student_id', session.user.id)
      .eq('status', 'pending'),
    supabase.from('quizzes')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', profile?.school_id)
      .gte('scheduled_at', new Date().toISOString()),
    supabase.from('live_classes')
      .select('id')
      .eq('school_id', profile?.school_id)
      .eq('status', 'live')
      .single(),
    supabase.from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .eq('is_read', false),
  ])

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
      userId={session.user.id}
      counts={{
        pendingTasks:    pendingTasks    ?? 0,
        upcomingQuizzes: upcomingQuizzes ?? 0,
        isLive:          !!liveClass,
        notifications:   notifications  ?? 0,
      }}
    />
  )
}
