// src/app/dashboard/bursar/page.tsx

import { createClient }       from '@/lib/supabase/server'
import { redirect }           from 'next/navigation'
import { checkSubscription }  from '@/lib/subscription'
import SubscriptionGate       from '@/components/SubscriptionGate'
import BursarDashboardClient  from './BursarDashboardClient'

export default async function BursarDashboardPage() {
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

  if (!profile || profile.role !== 'bursar') redirect('/login')

  const school   = (profile as any)?.schools ?? null
  const schoolId = profile.school_id

  // ── Fee stats ─────────────────────────────────────────────────────────────
  const [
    { data: feeStructures },
    { count: pendingPayments },
    { count: totalStudents },
    { data: recentPayments },
  ] = await Promise.all([
    supabase
      .from('fee_structures')
      .select('id, name, amount, due_date')
      .eq('school_id', schoolId)
      .order('due_date', { ascending: true })
      .limit(5),

    supabase
      .from('fee_payments')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('status', 'pending'),

    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('role', 'student'),

    supabase
      .from('fee_payments')
      .select('id, amount, status, paid_at, student_id')
      .eq('school_id', schoolId)
      .order('paid_at', { ascending: false })
      .limit(10),
  ])

  return (
    <BursarDashboardClient
      profile={profile}
      school={school}
      userId={user.id}
      feeStructures={feeStructures ?? []}
      pendingPayments={pendingPayments ?? 0}
      totalStudents={totalStudents ?? 0}
      recentPayments={recentPayments ?? []}
    />
  )
}
  
