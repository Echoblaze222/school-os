// src/app/dashboard/ict/meetings/page.tsx
import { createClient }      from '@/lib/supabase/server'
import { redirect }          from 'next/navigation'
import { getIctAppointment } from '@/lib/permissions'
import StaffMeetingsClient, { type MeetingRow } from '@/components/StaffMeetingsClient'

export const metadata = { title: 'Meetings | SchoolOS' }

export default async function IctMeetingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', user.id).single()
  if (!profile) redirect('/login')

  const appointment = await getIctAppointment(supabase, user.id, (profile as any).school_id)
  if (!appointment) redirect('/dashboard')

  const school   = (profile as any)?.schools ?? null
  const schoolId = (profile as any)?.school_id ?? ''

  const { data: meetings, error: meetingsError } = await supabase
    .from('online_meetings')
    .select('id, title, meeting_type, scheduled_at, location, meeting_url, agenda, target_audience, created_at')
    .eq('school_id', schoolId)
    .in('target_audience', ['all_staff'])
    .order('scheduled_at', { ascending: false })
    .limit(50)

  return (
    <StaffMeetingsClient
      userId={user.id} schoolId={schoolId} role="ict"
      meetings={(meetings ?? []) as MeetingRow[]}
      fetchError={meetingsError?.message ?? null}
      profile={profile} school={school}
    />
  )
}
