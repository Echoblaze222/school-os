// src/app/dashboard/parent/subscription/page.tsx
//
// Parent pays the per-student term subscription for each linked child.
// Parents are never locked; they can always reach this page.

import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { getAuthUser } from '@/lib/supabase/authUser'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { priceForStudent } from '@/lib/studentBilling'
import SubscriptionShell from '@/components/subscription/SubscriptionShell'
import PaySubscriptionList, { type PayItem } from '@/components/subscription/PaySubscriptionList'

export default async function ParentSubscriptionPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data: me } = await supabase.from('profiles').select('*, schools(*)').eq('id', user.id).single()
  if (!me || me.role !== 'parent') redirect('/dashboard')

  // Only this parent's own children: direct parent_id plus explicit links.
  const admin = createAdminClient()
  const [{ data: direct }, { data: links }] = await Promise.all([
    admin.from('profiles').select('id').eq('role', 'student').eq('parent_id', user.id),
    admin.from('parent_student_links').select('student_id').eq('parent_id', user.id),
  ])
  const ids = Array.from(new Set([
    ...(direct ?? []).map((r: any) => r.id),
    ...(links ?? []).map((r: any) => r.student_id),
  ]))

  const { data: kids } = ids.length
    ? await admin
        .from('profiles')
        .select('id, full_name, school_id, class:classes!profiles_class_id_fkey(name)')
        .in('id', ids)
        .eq('role', 'student')
    : { data: [] as any[] }

  const items: PayItem[] = []

  for (const k of kids ?? []) {
    const schoolId = (k as any).school_id as string | null
    if (!schoolId) continue

    // Principal's dates if set, otherwise the default Nigerian calendar.
    const { data: termJson } = await admin.rpc('current_term_json', { p_school: schoolId })
    const term = termJson as { id: string; term_name: string; grace_ends_on: string } | null

    const { data: paidRow } = term
      ? await admin
          .from('student_subscriptions').select('id')
          .eq('student_id', (k as any).id).eq('term_id', term.id).eq('status', 'paid')
          .maybeSingle()
      : { data: null }

    const { count } = await admin
      .from('profiles').select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId).eq('role', 'student').eq('is_active', true)
    const { amount, tierLabel } = priceForStudent(count ?? 0)

    const cls = (k as any).class
    items.push({
      studentId: (k as any).id,
      name: (k as any).full_name,
      className: Array.isArray(cls) ? cls[0]?.name : cls?.name,
      paid: !!paidRow,
      termName: term?.term_name ?? null,
      graceEndsOn: term?.grace_ends_on ?? null,
      amount,
      tierLabel,
    })
  }

  return (
    <SubscriptionShell role="parent" userId={user.id} profile={me} school={(me as any).schools ?? null} title="Subscription">
      <Suspense>
        <PaySubscriptionList items={items} />
      </Suspense>
    </SubscriptionShell>
  )
}
