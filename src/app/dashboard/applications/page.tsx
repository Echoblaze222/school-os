// src/app/dashboard/applications/page.tsx
// Public platform (Phase 4, Lane C) - §43 "My Applications" tracking area.
// This is the landing spot for any identity with school_id = null (see
// /dashboard/page.tsx). It intentionally does NOT use RolePageWrapper -
// that component's sidebar is built around a single school's branding
// and role-specific nav, which doesn't fit an applicant who may have
// open applications to several different schools at once.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ApplicationsTrackerClient from './ApplicationsTrackerClient'

export default async function ApplicationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, school_id')
    .eq('id', user.id)
    .single()

  // A tenant member (already enrolled/employed somewhere) landing here
  // directly (bookmark, back button) belongs in their real dashboard,
  // not the applicant tracker.
  if (profile?.school_id) redirect('/dashboard')

  const { data: applications } = await supabase
    .from('admission_applications')
    .select(`
      id, school_id, applicant_name, class_applying_for, status,
      submitted_at, interview_at, assessment_at, created_at,
      schools:school_id ( name, logo_url, primary_color )
    `)
    .order('created_at', { ascending: false })

  // Same to-one FK join array-vs-object inference mismatch as
  // (public)/apply/[schoolId]/page.tsx - normalize defensively.
  const normalizedApplications = (applications ?? []).map((app: any) => ({
    ...app,
    schools: Array.isArray(app.schools) ? app.schools[0] : app.schools,
  }))

  return (
    <ApplicationsTrackerClient
      profile={profile}
      applications={normalizedApplications}
    />
  )
}
