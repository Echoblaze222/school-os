// src/app/dashboard/parent/meetings/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ParentMeetingsClient from './ParentMeetingsClient'

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
  target_class_id: string | null
  created_at: string
}

export default async function ParentMeetingsPage() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, school_id, role, schools(*)')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'parent') redirect('/dashboard')

  const schoolId = profile?.school_id ?? ''
  const school   = (profile as any)?.schools ?? null

  // Get child's class_id so we can include specific_class meetings for that class
  const { data: childProfile } = await supabase
    .from('profiles')
    .select('id, class_id')
    .eq('parent_id', user.id)
    .eq('school_id', schoolId)
    .eq('role', 'student')
    .maybeSingle()

  const childClassId = childProfile?.class_id ?? null

  // Fetch all_parents meetings + specific_class meetings for child's class
  const { data: meetings, error: meetingsError } = await supabase
    .from('online_meetings')
    .select('id, title, meeting_type, scheduled_at, location, meeting_url, agenda, target_audience, target_class_id, created_at')
    .eq('school_id', schoolId)
    .or(
      childClassId
        ? `target_audience.eq.all_parents,and(target_audience.eq.specific_class,target_class_id.eq.${childClassId})`
        : 'target_audience.eq.all_parents'
    )
    .order('scheduled_at', { ascending: false })
    .limit(50)

  return (
    <ParentMeetingsClient
      userId={user.id}
      schoolId={schoolId}
      meetings={(meetings ?? []) as MeetingRow[]}
      fetchError={meetingsError?.message ?? null}
      profile={profile}
      school={school}
      childClassId={childClassId}
    />
  )
}
