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

  // ── Step 1: fetch profile first (need school_id before parallel queries) ──
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, school_id')
    .eq('id', user.id)
    .single()

  const schoolId    = profile?.school_id ?? ''
  const primaryColor = (() => {
    // school brand colour is already injected as --brand by the layout;
    // pass it through for any inline style that still needs a JS value
    return undefined // clients use var(--brand) via CSS
  })()

  // ── Step 2: parallel queries scoped to this school ───────────────────────
  const [meetingsRes, classesRes] = await Promise.all([
    supabase
      .from('meetings')
      .select('id, title, meeting_type, scheduled_at, location, meeting_url, agenda, target_audience, created_at')
      .eq('school_id', schoolId)
      .order('scheduled_at', { ascending: false })
      .limit(50),

    supabase
      .from('classes')
      .select('id, name')
      .eq('school_id', schoolId)
      .order('name'),
  ])

  return (
    <PrincipalMeetingsClient
      principalId={user.id}
      schoolId={schoolId}
      principalName={profile?.full_name ?? 'Principal'}
      meetings={(meetingsRes.data ?? []) as MeetingRow[]}
      classes={(classesRes.data ?? []) as ClassOption[]}
    />
  )
}
