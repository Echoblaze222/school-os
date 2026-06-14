// src/app/dashboard/teacher/meetings/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TeacherMeetingsClient from './TeacherMeetingsClient'

export const metadata = { title: 'Meetings — SchoolOS' }

export interface TeacherMeeting {
  id: string
  title: string
  meeting_type: string
  scheduled_at: string
  location: string | null
  meeting_url: string | null
  agenda: string | null
  target_audience: string
}

export default async function TeacherMeetingsPage() {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) redirect('/login')

  // Fetch meetings that target teachers or all staff
  const { data: meetings, error } = await supabase
    .from('online_meetings')
    .select('id, title, meeting_type, scheduled_at, location, meeting_url, agenda, target_audience')
    .in('target_audience', ['all_teachers', 'all_staff'])
    .order('scheduled_at', { ascending: false })

  if (error) console.error('[teacher-meetings] fetch error:', error.message)

  return (
    <TeacherMeetingsClient
      teacherId={user.id}
      meetings={(meetings ?? []) as TeacherMeeting[]}
    />
  )
}
