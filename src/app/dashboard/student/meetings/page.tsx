// src/app/dashboard/student/meetings/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StudentMeetingsClient from './StudentMeetingsClient'

export const metadata = { title: 'Meetings | SchoolOS' }

export interface MeetingRow {
  id: string
  title: string
  meeting_type: string
  scheduled_at: string
  location: string | null
  meeting_url: string | null
  agenda: string | null
  target_audience: string
  target_class_id: string | null
  created_at: string
}

export default async function StudentMeetingsPage() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, school_id, role, class_id, schools(*)')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'student') redirect('/dashboard')

  const schoolId = profile?.school_id ?? ''

  // student_profiles.class_id is what promotion/transfer actually updates - // it's the CURRENT class. profiles.class_id is never touched by
  // promotion, so it goes stale after any promotion; only used as a
  // fallback when a student has no student_profiles row at all.
  const { data: sp } = await supabase
    .from('student_profiles')
    .select('class_id')
    .eq('id', user.id)
    .maybeSingle()

  const classId = sp?.class_id ?? profile?.class_id ?? null
  const school   = (profile as any)?.schools ?? null

  // Students see meetings specifically targeted at their class
  const { data: meetings, error: meetingsError } = await supabase
    .from('online_meetings')
    .select('id, title, meeting_type, scheduled_at, location, meeting_url, agenda, target_audience, target_class_id, created_at')
    .eq('school_id', schoolId)
    .or(
      classId
        ? `and(target_audience.eq.specific_class,target_class_id.eq.${classId})`
        : 'target_audience.eq.none'   // no class → no meetings shown
    )
    .order('scheduled_at', { ascending: false })
    .limit(50)

  return (
    <StudentMeetingsClient
      userId={user.id}
      schoolId={schoolId}
      classId={classId}
      meetings={(meetings ?? []) as MeetingRow[]}
      fetchError={meetingsError?.message ?? null}
      profile={profile}
      school={school}
    />
  )
    }