// src/app/dashboard/parent/page.tsx

import { createClient }       from '@/lib/supabase/server'
import { redirect }           from 'next/navigation'
import { checkSubscription }  from '@/lib/subscription'
import SubscriptionGate       from '@/components/SubscriptionGate'
import ParentDashboardClient  from './ParentDashboardClient'

export default async function ParentDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // ── Subscription check (before any other data fetching) ──────────────────
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

  // ── Profile + school (single query) ──────────────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'parent') redirect('/login')

  const school = (profile as any)?.schools ?? null

  // ── Recent activities (last 15, most recent first) ─────────────────────────
  const { data: activityRows } = await supabase
    .from('recent_activities')
    .select('id, type, title, subtitle, href, metadata, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(15)

  const activities = (activityRows ?? []).map(row => ({
    id:         row.id,
    type:       row.type,
    title:      row.title,
    subtitle:   row.subtitle ?? undefined,
    href:       row.href,
    created_at: row.created_at,
    preview: row.metadata
      ? {
          body: row.metadata.body,
          meta: row.metadata.meta,
        }
      : undefined,
  }))

  return (
    <ParentDashboardClient
      profile={profile}
      school={school}
      userId={user.id}
      activities={activities}
    />
  )
}
