// src/app/dashboard/ict/page.tsx
//
// Layout.tsx already redirects non-ICT users away, but this page still
// re-derives the appointment kind (officer vs administrator) itself
// rather than trusting a value handed down some other way, the same
// "never trust a hidden nav item as the real boundary" reasoning as the
// layout's own comment. That re-check is intentional and kept as-is;
// only the user+profile+school fetch below it is now shared with the
// layout via getAuthedProfile() (src/lib/auth/getAuthedProfile.ts).

import { createAdminClient } from '@/lib/supabase/admin'
import { redirect }          from 'next/navigation'
import { checkSubscription } from '@/lib/subscription'
import SubscriptionGate      from '@/components/SubscriptionGate'
import { getIctAppointment } from '@/lib/permissions'
import IctClient              from './IctClient'
import { getAuthedProfile }   from '@/lib/auth/getAuthedProfile'

export default async function IctPage() {
  // Shared with ict/layout.tsx via React's cache() - see
  // src/lib/auth/getAuthedProfile.ts.
  const { user, profile, school } = await getAuthedProfile()
  if (!user) redirect('/login')

  const sub = await checkSubscription(user.id)
  if (sub.locked) {
    return <SubscriptionGate schoolName={sub.schoolName} schoolColor={sub.schoolColor} status={sub.status as any} />
  }

  if (!profile?.school_id) redirect('/login')

  const admin = createAdminClient()
  const appointment = await getIctAppointment(admin, user.id, profile.school_id)
  if (!appointment) redirect('/dashboard')

  const schoolId = profile.school_id

  // recentTickets folded into this batch - was a separate, sequential
  // await after the counts block, adding one more full round trip for
  // no reason.
  const [
    openTickets, urgentTickets, assetsUnderRepair, openAccountRequests, pendingApplications, recentTicketsRes,
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
    admin
      .from('ict_tickets')
      .select('id, category, description, priority, status, created_at, profiles!ict_tickets_reporter_id_fkey(full_name)')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const counts = {
    openTickets:          openTickets.count          ?? 0,
    urgentTickets:        urgentTickets.count         ?? 0,
    assetsUnderRepair:    assetsUnderRepair.count     ?? 0,
    openAccountRequests:  openAccountRequests.count   ?? 0,
    pendingApplications:  pendingApplications.count   ?? 0,
  }

  return (
    <IctClient
      profile={profile}
      school={school}
      userId={user.id}
      appointment={appointment}
      counts={counts}
      recentTickets={recentTicketsRes.data ?? []}
    />
  )
}
