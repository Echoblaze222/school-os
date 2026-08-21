// src/app/(public)/apply/[schoolId]/page.tsx
// Public platform (Phase 4, Lane C) - §41 admission request flow.
// Reachable without a session (middleware allows /apply). Actually
// starting/submitting an application still requires one - handled in
// the client component, which shows a sign-in/create-account prompt
// instead of the form when there's no session.

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ApplyClient from './ApplyClient'

export default async function ApplyPage({ params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = await params
  const supabase = await createClient()

  const { data: settings } = await supabase
    .from('admission_settings')
    .select(`
      school_id, is_enabled, application_deadline, admission_fee, admission_fee_currency,
      required_documents, form_fields, eligibility_notes, requires_interview, requires_assessment,
      schools:school_id ( id, name, city, state, logo_url, primary_color )
    `)
    .eq('school_id', schoolId)
    .maybeSingle()

  // RLS already hides disabled schools' settings from anonymous/other
  // callers, so a missing row here means either the school doesn't
  // exist or isn't accepting applications - either way, not found.
  if (!settings || !settings.is_enabled) notFound()

  // Supabase's untyped query builder infers a to-one FK join (school_id
  // is a single foreign key, not a junction table) as an array type
  // regardless of the actual single-object shape it returns at runtime
  // for this relationship - normalize defensively so this works
  // whichever shape actually comes back, rather than gambling on it.
  const rawSchool = settings.schools as unknown
  const school = Array.isArray(rawSchool) ? rawSchool[0] : rawSchool
  const normalizedSettings = { ...settings, schools: school }

  const { data: { user } } = await supabase.auth.getUser()
  let existingDraft = null
  if (user) {
    const { data } = await supabase
      .from('admission_applications')
      .select('id, status')
      .eq('school_id', schoolId)
      .eq('applicant_profile_id', user.id)
      .eq('status', 'draft')
      .maybeSingle()
    existingDraft = data
  }

  return (
    <ApplyClient
      settings={normalizedSettings}
      isAuthenticated={!!user}
      existingDraftId={existingDraft?.id ?? null}
    />
  )
}
