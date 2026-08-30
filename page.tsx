// src/app/dashboard/vice-principal/meetings/page.tsx
import { requireAppointmentPage } from '@/lib/permissions'
import StaffMeetingsClient, { type MeetingRow } from '@/components/StaffMeetingsClient'

export const metadata = { title: 'Meetings | SchoolOS' }

export default async function VpMeetingsPage() {
  const { supabase, ctx } = await requireAppointmentPage('vice_principal')

  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', ctx.userId).single()
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
      userId={ctx.userId} schoolId={schoolId} role="vice-principal"
      meetings={(meetings ?? []) as MeetingRow[]}
      fetchError={meetingsError?.message ?? null}
      profile={profile} school={school}
    />
  )
}
