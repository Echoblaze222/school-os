// src/app/dashboard/secretary/admissions/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdmissionsClient from './AdmissionsClient'

export default async function AdmissionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'secretary') redirect('/login')
  const school = (profile as any)?.schools ?? null

  // Repointed from the legacy public.admissions table to the canonical
  // admission_applications table (Phase 4, Lane D - see
  // sql/admission-system-schema.sql). This is now the single admission
  // review surface; the separate /secretary/applications module was a
  // disconnected duplicate and now redirects here.
  const [{ data: admissions }, { data: classes }] = await Promise.all([
    supabase
      .from('admission_applications')
      .select(`
        id, applicant_name, applicant_email, applicant_phone, class_applying_for,
        status, submitted_at, created_at, interview_at, assessment_at, decision_notes,
        migrated_from
      `)
      .eq('school_id', profile.school_id)
      .order('created_at', { ascending: false }),
    supabase.from('classes').select('id, name').eq('school_id', profile.school_id).order('name'),
  ])

  return <AdmissionsClient admissions={admissions ?? []} profile={profile} school={school} userId={user.id} classes={classes ?? []} />
}
