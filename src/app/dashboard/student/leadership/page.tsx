// src/app/dashboard/student/leadership/page.tsx
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect }          from 'next/navigation'
import LeadershipClient from './LeadershipClient'

export default async function LeadershipPage({
  searchParams,
}: { searchParams: Promise<{ appointmentId?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const adminClient = createAdminClient()
  const params = await searchParams

  // §7's dashboard is per-appointment (a student could theoretically
  // hold more than one leadership title). If no specific appointment was
  // requested, default to the caller's first active one.
  let appointmentId = params.appointmentId
  if (!appointmentId) {
    const { data: first } = await adminClient
      .from('appointments')
      .select('id')
      .eq('profile_id', user.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
    if (!first) redirect('/dashboard/student')
    appointmentId = first.id
  }

  const { data: appointment } = await adminClient
    .from('appointments')
    .select('id, appointment_type, profile_id, status')
    .eq('id', appointmentId)
    .maybeSingle()

  if (!appointment || appointment.profile_id !== user.id || appointment.status !== 'active') {
    redirect('/dashboard/student')
  }

  return <LeadershipClient appointmentId={appointment.id} appointmentType={appointment.appointment_type} />
}
