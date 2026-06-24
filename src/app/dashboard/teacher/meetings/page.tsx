// src/app/dashboard/teacher/meetings/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TeacherMeetingsClient from './TeacherMeetingsClient'

export const metadata = { title: 'Meetings — SchoolOS' }

export interface MeetingRow {
  id: string
  title: string
  meeting_type: string
  scheduled_at: string
  location: string | null
  meeting_url: string | null
  agenda: string | null
  target_audience: string
  created_at: string
}

export default async function TeacherMeetingsPage() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, school_id, role, schools(*)')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'teacher') redirect('/dashboard')

  const schoolId = profile?.school_id ?? ''
  const school   = (profile as any)?.schools ?? null

  const { data: meetings, error: meetingsError } = await supabase
    .from('online_meetings')
    .select('id, title, meeting_type, scheduled_at, location, meeting_url, agenda, target_audience, created_at')
    .eq('school_id', schoolId)
    .in('target_audience', ['all_teachers', 'all_staff'])
    .order('scheduled_at', { ascending: false })
    .limit(50)

  return (
    <TeacherMeetingsClient
      userId={user.id}
      schoolId={schoolId}
      meetings={(meetings ?? []) as MeetingRow[]}
      fetchError={meetingsError?.message ?? null}
      profile={profile}
      school={school}
    />
  )
}
