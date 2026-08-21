// src/app/dashboard/hostel/page.tsx
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect }          from 'next/navigation'
import { checkSubscription } from '@/lib/subscription'
import SubscriptionGate      from '@/components/SubscriptionGate'
import { requireHostelStaff } from '@/lib/permissions'
import HostelDashboardClient from './HostelDashboardClient'

export default async function HostelDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

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

  // Hostel staff is an appointment, not a base role: checked via
  // Phase 1's appointments table, not profile.role. A teacher with no
  // active hostel appointment gets sent back to their own dashboard, not
  // an error page, since ending up here with a stale link is a routing
  // mistake, not a security incident.
  const adminClient = createAdminClient()
  const auth = await requireHostelStaff(adminClient, user.id)
  if (!auth) redirect('/dashboard')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  const school = (profile as any)?.schools ?? null

  const { data: hostels } = await adminClient
    .from('hostels')
    .select('id, name, gender')
    .eq('school_id', auth.profile.school_id)
    .order('name')

  return (
    <HostelDashboardClient
      school={school}
      hostels={hostels ?? []}
      appointmentType={auth.appointment?.appointment_type ?? 'principal'}
    />
  )
}
