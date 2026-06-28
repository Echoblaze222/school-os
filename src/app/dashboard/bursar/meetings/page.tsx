// src/app/dashboard/bursar/meetings/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BursarMeetingsClient from './BursarMeetingsClient'
import { checkSubscription }  from '@/lib/subscription'       // ← ADD THIS IMPORT
import SubscriptionGate       from '@/components/SubscriptionGate'

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

export default async function BursarMeetingsPage() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, school_id, role, schools(*)')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'bursar') redirect('/dashboard')

  const schoolId = profile?.school_id ?? ''
  const school   = (profile as any)?.schools ?? null

  const { data: meetings, error: meetingsError } = await supabase
    .from('online_meetings')
    .select('id, title, meeting_type, scheduled_at, location, meeting_url, agenda, target_audience, created_at')
    .eq('school_id', schoolId)
    .in('target_audience', ['all_staff'])
    .order('scheduled_at', { ascending: false })
    .limit(50)
  // ── Subscription check ───────────────────────────────────────────────────
  // ADD THIS BLOCK to every non-principal dashboard page
  const sub = await checkSubscription(user.id)
  if (sub.locked) {
    return (
      <SubscriptionGate
        schoolName={sub.schoolName}
        schoolColor={sub.schoolColor}
        status={sub.status as any}
      />
    )
  }
  // ── End subscription check ───────────────────────────────────────────────

  // ... rest of your existing page data-fetching and return ...
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <BursarMeetingsClient
      userId={user.id}
      schoolId={schoolId}
      meetings={(meetings ?? []) as MeetingRow[]}
      fetchError={meetingsError?.message ?? null}
      profile={profile}
      school={school}
    />
  )
}
