// src/app/dashboard/counselor/page.tsx
//
// Server-side authorization for the Counselor dashboard. This is the real
// security boundary for this feature, not RoleNav (which only decides what
// links render) and not middleware.ts (whose DASHBOARD_ROLE_SEGMENTS list
// only understands base profiles.role values, 'counselor' is deliberately
// left out of it, since Counselor is an appointment layered on top of the
// 'teacher' base role, not a base role itself; adding it there would
// incorrectly redirect every legitimate counselor away from their own
// dashboard). So this page independently re-verifies both facts before
// rendering anything: the caller is signed in AND holds an ACTIVE
// 'counselor' appointment at their school.

import { createClient }      from '@/lib/supabase/server'
import { redirect }          from 'next/navigation'
import { checkSubscription } from '@/lib/subscription'
import SubscriptionGate      from '@/components/SubscriptionGate'
import { hasActiveAppointment } from '@/lib/permissions'
import CounselorDashboardClient from './CounselorDashboardClient'

export default async function CounselorDashboardPage() {
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'teacher') redirect('/login')

  const isCounselor = await hasActiveAppointment(supabase, user.id, profile.school_id, 'counselor')
  if (!isCounselor) redirect('/dashboard/teacher')

  const school   = (profile as any)?.schools ?? null
  const schoolId = profile.school_id

  const [
    { count: openCases },
    { count: monitoringCases },
    { count: upcomingSessions },
    { count: pendingReferrals },
    { count: overdueFollowUps },
  ] = await Promise.all([
    supabase.from('counseling_cases').select('id', { count: 'exact', head: true })
      .eq('counselor_profile_id', user.id).eq('status', 'open'),
    supabase.from('counseling_cases').select('id', { count: 'exact', head: true })
      .eq('counselor_profile_id', user.id).eq('status', 'monitoring'),
    supabase.from('counseling_sessions').select('id', { count: 'exact', head: true })
      .eq('counselor_profile_id', user.id).eq('status', 'scheduled')
      .gte('scheduled_at', new Date().toISOString()),
    supabase.from('counseling_referrals').select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId).eq('status', 'pending')
      .or(`referred_to_profile_id.eq.${user.id},referred_to_profile_id.is.null`),
    supabase.from('counseling_follow_ups').select('id', { count: 'exact', head: true })
      .eq('counselor_profile_id', user.id).eq('status', 'pending')
      .lt('due_at', new Date().toISOString()),
  ])

  return (
    <CounselorDashboardClient
      userId={user.id}
      counselorName={profile.full_name ?? 'Counselor'}
      school={school}
      stats={{
        openCases: openCases ?? 0,
        monitoringCases: monitoringCases ?? 0,
        upcomingSessions: upcomingSessions ?? 0,
        pendingReferrals: pendingReferrals ?? 0,
        overdueFollowUps: overdueFollowUps ?? 0,
      }}
    />
  )
}
