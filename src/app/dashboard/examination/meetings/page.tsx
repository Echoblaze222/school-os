// src/app/dashboard/examination/meetings/page.tsx
import { getExamContext } from '@/lib/supabase/getExamContext'
import { createClient }   from '@/lib/supabase/server'
import StaffMeetingsClient, { type MeetingRow } from '@/components/StaffMeetingsClient'

export const metadata = { title: 'Meetings | SchoolOS' }

export default async function ExaminationMeetingsPage() {
  const { profile, school, userId } = await getExamContext()
  const supabase  = await createClient()
  const schoolId  = (profile as any)?.school_id ?? ''

  const { data: meetings, error: meetingsError } = await supabase
    .from('online_meetings')
    .select('id, title, meeting_type, scheduled_at, location, meeting_url, agenda, target_audience, created_at')
    .eq('school_id', schoolId)
    .in('target_audience', ['all_staff'])
    .order('scheduled_at', { ascending: false })
    .limit(50)

  return (
    <StaffMeetingsClient
      userId={userId} schoolId={schoolId} role="examination"
      meetings={(meetings ?? []) as MeetingRow[]}
      fetchError={meetingsError?.message ?? null}
      profile={profile} school={school}
    />
  )
}
