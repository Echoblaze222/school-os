// src/app/dashboard/hostel/meetings/page.tsx
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect }          from 'next/navigation'
import { requireHostelStaff } from '@/lib/permissions'
import StaffMeetingsClient, { type MeetingRow } from '@/components/StaffMeetingsClient'

export const metadata = { title: 'Meetings | SchoolOS' }

export default async function HostelMeetingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const access = await requireHostelStaff(admin, user.id)
  if (!access) redirect('/dashboard')

  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', user.id).single()
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
      userId={user.id} schoolId={schoolId} role="hostel"
      meetings={(meetings ?? []) as MeetingRow[]}
      fetchError={meetingsError?.message ?? null}
      profile={profile} school={school}
    />
  )
}
