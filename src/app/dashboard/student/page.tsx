import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StudentDashboardClient from './StudentDashboardClient'

export default async function StudentDashboardPage() {
  const supabase =await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
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
      .eq('student_id', user.id)
      .eq('status', 'pending'),
    supabase.from('quizzes')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', profile?.school_id)
      .eq('class_id', profile?.class_id)
      .gte('scheduled_at', new Date().toISOString()),
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
      userId={user.id}
      counts={{
        pendingTasks:    pendingTasks    ?? 0,
        upcomingQuizzes: upcomingQuizzes ?? 0,
        isLive:          !!liveClass,
        notifications:   notifications  ?? 0,
      }}
    />
  )
}
