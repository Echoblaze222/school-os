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
import PaySubscriptionList from '@/components/subscription/PaySubscriptionList'

export default async function StudentSubscribePage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, school_id, full_name')
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
    <main style={{ maxWidth: 520, margin: '0 auto', padding: '32px 16px' }}>
      <h1 style={{ fontSize: '1.4rem', margin: '0 0 6px' }}>Your term subscription</h1>
      <p style={{ opacity: 0.7, fontSize: '0.9rem', margin: '0 0 20px' }}>
        Pay here, or ask your parent to pay from their SchoolOS account. Your access unlocks as soon as payment is confirmed.
      </p>
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
    </main>
  )
}
