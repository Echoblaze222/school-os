// src/app/dashboard/principal/subscriptions/page.tsx
//
// Principal view of subscriptions: STATISTICS ONLY.
// Counts and percentages of paid vs unpaid students, per class. No names, no
// amounts, no totals: the principal must not be able to work out what the
// student body is paying in total. Students and parents pay; this page only
// reports how many have. It also lets the principal set the school-wide term
// dates that decide when unpaid students lock.

import { getAuthUser } from '@/lib/supabase/authUser'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SubscriptionClient, { type SubscriptionStats, type TermRow } from './SubscriptionClient'

export default async function SubscriptionPage() {
  const supabase = await createClient()

  const user = await getAuthUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('school_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'principal' || !profile.school_id) redirect('/dashboard/principal')

  const { data: stats } = await supabase.rpc('subscription_stats_for_principal')

  const { data: terms } = await supabase
    .from('school_terms')
    .select('id, academic_year, term_name, starts_on, ends_on, grace_days')
    .eq('school_id', profile.school_id)
    .order('starts_on', { ascending: false })
    .limit(12)

  return (
    <SubscriptionClient
      schoolId={profile.school_id}
      stats={(stats ?? { term: null }) as SubscriptionStats}
      terms={(terms ?? []) as TermRow[]}
    />
  )
}
