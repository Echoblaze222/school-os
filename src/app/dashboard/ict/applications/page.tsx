// src/app/dashboard/ict/applications/page.tsx
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect }          from 'next/navigation'
import { getIctAppointment } from '@/lib/permissions'
import ApplicationsClient     from './ApplicationsClient'

export default async function IctApplicationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('school_id, schools(primary_color)').eq('id', user.id).single()
  if (!profile?.school_id) redirect('/login')

  const admin = createAdminClient()
  const appointment = await getIctAppointment(admin, user.id, profile.school_id)
  if (!appointment) redirect('/dashboard')

  const { data: rawApplications } = await admin
    .from('access_code_applications')
    .select('id, full_name, email, phone, role_applied_for, verification_method, status, submitted_at, reviewed_at, rejection_reason, appointment_types(label)')
    .eq('school_id', profile.school_id)
    .order('submitted_at', { ascending: false })
    .limit(100)

  // Same to-one join array-vs-object normalization as the other ICT pages.
  const applications = (rawApplications ?? []).map((a: any) => ({
    ...a,
    appointment_types: Array.isArray(a.appointment_types) ? a.appointment_types[0] : a.appointment_types,
  }))

  const school = (profile as any).schools ?? null

  return (
    <ApplicationsClient
      initialApplications={applications}
      schoolColor={school?.primary_color ?? '#800020'}
      canReject={appointment !== null}
    />
  )
}
