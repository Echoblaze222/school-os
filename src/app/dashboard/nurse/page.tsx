// src/app/dashboard/nurse/page.tsx
//
// Server-side authorization for the Nurse dashboard - the real security
// boundary, same reasoning as counselor/page.tsx and ict/page.tsx:
// middleware.ts only decides whether to let the request through to this
// route at all (APPOINTMENT_DASHBOARD_SEGMENTS), it doesn't replace this
// page independently re-verifying the caller holds an ACTIVE 'nurse'
// appointment at their school before rendering anything.

import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect }          from 'next/navigation'
import { checkSubscription } from '@/lib/subscription'
import SubscriptionGate      from '@/components/SubscriptionGate'
import { hasActiveAppointment } from '@/lib/permissions'
import NurseDashboardClient  from './NurseDashboardClient'

export default async function NurseDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sub = await checkSubscription(user.id)
  if (sub.locked) {
    return <SubscriptionGate schoolName={sub.schoolName} schoolColor={sub.schoolColor} status={sub.status as any} />
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  if (!profile?.school_id) redirect('/login')

  const isNurse = await hasActiveAppointment(supabase, user.id, profile.school_id, 'nurse')
  if (!isNurse) redirect('/dashboard')

  const school   = (profile as any).schools ?? null
  const schoolId = profile.school_id
  const admin    = createAdminClient()

  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
  const startOfTodayIso = startOfToday.toISOString()

  const [
    { count: visitsToday },
    { count: pendingMeds },
    { data: inventoryItems },
    { data: recentVisits },
  ] = await Promise.all([
    admin.from('clinic_visits').select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId).gte('visited_at', startOfTodayIso),
    admin.from('medication_administrations').select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId).eq('status', 'pending'),
    admin.from('clinic_inventory').select('quantity_on_hand, reorder_level').eq('school_id', schoolId),
    admin.from('clinic_visits')
      .select('id, reason, outcome, visited_at, profiles!clinic_visits_student_id_fkey(full_name)')
      .eq('school_id', schoolId)
      .order('visited_at', { ascending: false })
      .limit(5),
  ])

  const lowStockItems = (inventoryItems ?? []).filter((i: any) => i.quantity_on_hand <= i.reorder_level).length

  const stats = {
    visitsToday: visitsToday ?? 0,
    pendingMeds: pendingMeds ?? 0,
    lowStockItems,
  }

  return (
    <NurseDashboardClient
      userId={user.id}
      nurseName={profile.full_name}
      school={school}
      stats={stats}
      recentVisits={recentVisits ?? []}
    />
  )
}
