// src/app/dashboard/applications/[id]/page.tsx
// Single application detail + timeline + messages (§43).
// RLS on admission_applications means this select simply returns
// nothing if the caller doesn't own the row - notFound() covers both
// "doesn't exist" and "not yours" without distinguishing them, which is
// the correct behavior (distinguishing the two would leak which IDs exist).

import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ApplicationDetailClient from './ApplicationDetailClient'

export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: application } = await supabase
    .from('admission_applications')
    .select(`
      id, school_id, applicant_name, applicant_email, applicant_phone,
      class_applying_for, status, submitted_at, interview_at, assessment_at,
      decision_notes, created_at,
      schools:school_id ( name, logo_url, primary_color, city, state )
    `)
    .eq('id', id)
    .maybeSingle()

  if (!application) notFound()

  const { data: events } = await supabase
    .from('admission_status_events')
    .select('id, status, note, created_at')
    .eq('application_id', id)
    .order('created_at', { ascending: true })

  const { data: messages } = await supabase
    .from('admission_messages')
    .select('id, body, sender_is_school, created_at')
    .eq('application_id', id)
    .order('created_at', { ascending: true })

  return (
    <ApplicationDetailClient
      application={application}
      events={events ?? []}
      messages={messages ?? []}
      userId={user.id}
    />
  )
}
