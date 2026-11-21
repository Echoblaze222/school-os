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
import PaySubscriptionList, { type PayItem } from '@/components/subscription/PaySubscriptionList'

export default async function ParentSubscriptionPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
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

  const today = new Date().toISOString().slice(0, 10)
  const items: PayItem[] = []

  for (const k of kids ?? []) {
    const schoolId = (k as any).school_id as string | null
    if (!schoolId) continue

    const { data: term } = await admin
      .from('school_terms')
      .select('id, term_name, starts_on, grace_days')
      .eq('school_id', schoolId)
      .lte('starts_on', today).gte('ends_on', today)
      .order('starts_on', { ascending: false }).limit(1).maybeSingle()

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

    let graceEndsOn: string | null = null
    if (term) {
      const d = new Date(term.starts_on)
      d.setDate(d.getDate() + term.grace_days)
      graceEndsOn = d.toISOString().slice(0, 10)
    }

    const cls = (k as any).class
    items.push({
      studentId: (k as any).id,
      name: (k as any).full_name,
      className: Array.isArray(cls) ? cls[0]?.name : cls?.name,
      paid: !!paidRow,
      termName: term?.term_name ?? null,
      graceEndsOn,
      amount,
      tierLabel,
    })
  }

  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '32px 16px' }}>
      <h1 style={{ fontSize: '1.4rem', margin: '0 0 6px' }}>Term subscription</h1>
      <p style={{ opacity: 0.7, fontSize: '0.9rem', margin: '0 0 20px' }}>
        Each child&apos;s SchoolOS access is paid per term. Pay for each child below. Their access stays active as soon as payment is confirmed.
      </p>
      <Suspense>
        <PaySubscriptionList items={items} />
      </Suspense>
    </main>
  )
}
