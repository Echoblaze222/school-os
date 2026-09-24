// src/app/dashboard/parent/page.tsx

import { redirect }           from 'next/navigation'
import { checkSubscription }  from '@/lib/subscription'
import SubscriptionGate       from '@/components/SubscriptionGate'
import ParentDashboardClient  from './ParentDashboardClient'
import { getAuthedProfile }   from '@/lib/auth/getAuthedProfile'

export default async function ParentDashboardPage() {
  // Shared with parent/layout.tsx via React's cache() - see
  // src/lib/auth/getAuthedProfile.ts.
  const { user, profile, school } = await getAuthedProfile()
  if (!user) redirect('/login')
  if (!profile || profile.role !== 'parent') redirect('/login')

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

  // ── Recent activities (last 15, most recent first) ───────────────────
  const supabase = (await getAuthedProfile()) && (await import('@/lib/supabase/server')).createClient
  const client = await supabase()
  const { data: activityRows } = await client
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
