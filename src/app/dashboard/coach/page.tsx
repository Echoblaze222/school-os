// src/app/dashboard/coach/page.tsx
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect }          from 'next/navigation'
import { checkSubscription } from '@/lib/subscription'
import SubscriptionGate      from '@/components/SubscriptionGate'
import { hasActiveAppointment } from '@/lib/permissions'
import CoachDashboardClient  from './CoachDashboardClient'

export default async function CoachDashboardPage() {
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

  const isCoach = await hasActiveAppointment(supabase, user.id, profile.school_id, 'coach')
  if (!isCoach) redirect('/dashboard')

  const school   = (profile as any).schools ?? null
  const schoolId = profile.school_id
  const admin    = createAdminClient()

  const nowIso = new Date().toISOString()

  const [
    { data: teams },
    { count: upcomingMatches },
    { data: nextSession },
    { data: recentMatches },
  ] = await Promise.all([
    admin.from('sports_teams').select('id, name, sport').eq('school_id', schoolId).eq('coach_profile_id', user.id),
    admin.from('sports_matches').select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId).eq('status', 'scheduled').gte('scheduled_at', nowIso),
    admin.from('training_sessions')
      .select('id, scheduled_at, location, team:sports_teams(name)')
      .eq('school_id', schoolId).gte('scheduled_at', nowIso)
      .order('scheduled_at', { ascending: true }).limit(1),
    admin.from('sports_matches')
      .select('id, opponent, scheduled_at, status, our_score, opponent_score, team:sports_teams(name)')
      .eq('school_id', schoolId)
      .order('scheduled_at', { ascending: false })
      .limit(5),
  ])

  const teamIds = (teams ?? []).map(t => t.id)
  let totalPlayers = 0
  if (teamIds.length > 0) {
    const { count } = await admin.from('sports_team_members').select('id', { count: 'exact', head: true }).in('team_id', teamIds)
    totalPlayers = count ?? 0
  }

  const stats = {
    teamCount: (teams ?? []).length,
    totalPlayers,
    upcomingMatches: upcomingMatches ?? 0,
  }

  return (
    <CoachDashboardClient
      userId={user.id}
      coachName={profile.full_name}
      school={school}
      stats={stats}
      teams={teams ?? []}
      nextSession={nextSession?.[0] ?? null}
      recentMatches={recentMatches ?? []}
    />
  )
}
