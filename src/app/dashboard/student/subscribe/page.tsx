// src/app/dashboard/student/subscribe/page.tsx
//
// Where an unpaid student lands when locked (middleware confines them here).
// The student can pay for themselves, or tell their parent to pay from the
// parent dashboard. Staff, principals and parents are never sent here.

import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { getAuthUser } from '@/lib/supabase/authUser'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { priceForStudent } from '@/lib/studentBilling'
import SubscriptionShell from '@/components/subscription/SubscriptionShell'
import PaySubscriptionList from '@/components/subscription/PaySubscriptionList'

export default async function StudentSubscribePage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'student' || !profile.school_id) redirect('/dashboard')

  const { data: lock } = await supabase.rpc('my_subscription_lock')
  const info = (lock ?? {}) as { paid?: boolean; term_name?: string; grace_ends_on?: string }

  const admin = createAdminClient()
  const { count } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', profile.school_id)
    .eq('role', 'student')
    .eq('is_active', true)
  const { amount, tierLabel } = priceForStudent(count ?? 0)

  return (
    <SubscriptionShell role="student" userId={user.id} profile={profile} school={(profile as any).schools ?? null} title="Subscription">
      <Suspense>
        <PaySubscriptionList
          selfMode
          items={[{
            studentId: user.id,
            name: profile.full_name,
            paid: !!info.paid,
            termName: info.term_name ?? null,
            graceEndsOn: info.grace_ends_on ?? null,
            amount,
            tierLabel,
          }]}
        />
      </Suspense>
    </SubscriptionShell>
  )
}
