// src/app/dashboard/bursar/subscriptions/page.tsx
//
// Bursar view of paid/unpaid per student across the school. Status only.
// No totals or amounts: the RPC does not return them.

import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/supabase/authUser'
import { createClient } from '@/lib/supabase/server'
import SubscriptionShell from '@/components/subscription/SubscriptionShell'
import StaffSubscriptionStatus, { type StaffStatusStudent } from '@/components/subscription/StaffSubscriptionStatus'

export default async function BursarSubscriptionsPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data: profile } = await supabase.from('profiles').select('*, schools(*)').eq('id', user.id).single()
  const { data } = await supabase.rpc('subscription_status_for_staff')
  const result = (data ?? {}) as {
    term?: { name: string; grace_ends_on: string } | null
    students?: StaffStatusStudent[]
  }

  return (
    <SubscriptionShell role="bursar" userId={user.id} profile={profile} school={(profile as any)?.schools ?? null} title="Subscriptions">
      <StaffSubscriptionStatus
        termName={result.term?.name ?? null}
        graceEndsOn={result.term?.grace_ends_on ?? null}
        students={result.students ?? []}
      />
    </SubscriptionShell>
  )
}
