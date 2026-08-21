// src/app/dashboard/ict/page.tsx
//
// Layout.tsx already redirects non-ICT users away, but this page still
// re-derives the appointment kind (officer vs administrator) itself
// rather than trusting a value handed down some other way, the same
// "never trust a hidden nav item as the real boundary" reasoning as the
// layout's own comment.

import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect }          from 'next/navigation'
import { checkSubscription } from '@/lib/subscription'
import SubscriptionGate      from '@/components/SubscriptionGate'
import { getIctAppointment } from '@/lib/permissions'
import IctClient              from './IctClient'

export default async function IctPage() {
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

  const admin = createAdminClient()
  const appointment = await getIctAppointment(admin, user.id, profile.school_id)
  if (!appointment) redirect('/dashboard')

  const school   = (profile as any).schools ?? null
  const schoolId = profile.school_id

  const [
    openTickets, urgentTickets, assetsUnderRepair, openAccountRequests, pendingApplications,
  ] = await Promise.all([
    admin.from('ict_tickets').select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId).in('status', ['new', 'assigned', 'in_progress', 'waiting']),
    admin.from('ict_tickets').select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId).in('status', ['new', 'assigned', 'in_progress', 'waiting']).in('priority', ['high', 'urgent']),
    admin.from('ict_assets').select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId).eq('status', 'under_repair'),
    admin.from('ict_account_requests').select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId).eq('status', 'open'),
    admin.from('access_code_applications').select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId).in('status', ['pending', 'under_review']),
  ])

  const counts = {
    openTickets:          openTickets.count          ?? 0,
    urgentTickets:        urgentTickets.count         ?? 0,
    assetsUnderRepair:    assetsUnderRepair.count     ?? 0,
    openAccountRequests:  openAccountRequests.count   ?? 0,
    pendingApplications:  pendingApplications.count   ?? 0,
  }

  const { data: recentTickets } = await admin
    .from('ict_tickets')
    .select('id, category, description, priority, status, created_at, profiles!ict_tickets_reporter_id_fkey(full_name)')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(5)

  return (
    <IctClient
      profile={profile}
      school={school}
      userId={user.id}
      appointment={appointment}
      counts={counts}
      recentTickets={recentTickets ?? []}
    />
  )
}
