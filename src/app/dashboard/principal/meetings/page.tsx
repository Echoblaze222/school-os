// src/app/dashboard/principal/meetings/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PrincipalMeetingsClient from './PrincipalMeetingsClient'

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

export interface ClassOption {
  id: string
  name: string
}

export default async function PrincipalMeetingsPage() {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) redirect('/login')

  const [profileRes, meetingsRes, classesRes] = await Promise.all([
    supabase
      .from('principal_profiles')
      .select('full_name, school_id')
      .eq('user_id', user.id)
      .maybeSingle(),

    supabase
      .from('meetings')
      .select('id, title, meeting_type, scheduled_at, location, meeting_url, agenda, target_audience, created_at')
      .order('scheduled_at', { ascending: false })
      .limit(50),

    supabase
      .from('classes')
      .select('id, name')
      .order('name'),
  ])

  return (
    <PrincipalMeetingsClient
      principalId={user.id}
      schoolId={profileRes.data?.school_id ?? ''}
      principalName={profileRes.data?.full_name ?? 'Principal'}
      meetings={(meetingsRes.data ?? []) as MeetingRow[]}
      classes={(classesRes.data ?? []) as ClassOption[]}
    />
  )
}
