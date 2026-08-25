import { createClient } from '@/lib/supabase/server'

import { redirect } from 'next/navigation'

import SubscriptionClient from './SubscriptionClient'



export default async function SubscriptionPage() {

  const supabase = await createClient()



  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')



  const { data: profile } = await supabase

    .from('profiles')

    .select('full_name, school_id, role')

    .eq('id', user.id)

    .single()



  if (!profile || profile.role !== 'principal') redirect('/dashboard/principal')



  // Get school details

  const { data: school } = await supabase

    .from('schools')

    .select('id, name, primary_color, logo_url, status, setup_status, is_platform_active')

    .eq('id', profile.school_id)

    .single()



  if (!school) redirect('/dashboard/principal')



  // Get current subscription

  const { data: subscription } = await supabase

    .from('subscriptions')

    .select('*')

    .eq('school_id', profile.school_id)

    .order('created_at', { ascending: false })

    .limit(1)

    .maybeSingle()



  // Get active student count

  const { count: studentCount } = await supabase

    .from('profiles')

    .select('*', { count: 'exact', head: true })

    .eq('school_id', profile.school_id)

    .eq('role', 'student')

    .eq('is_active', true)



  // Get payment history — only CONFIRMED payments (paid_at set). renew/
  // route.ts pre-logs a row the instant Paystack returns a checkout URL,
  // before the person has actually paid, so unfiltered this table shows
  // abandoned/failed attempts identically to real successes. `term` and
  // `academic_year` were never written by either the pre-log insert or
  // activateSubscription's upsert - selecting them here always returned
  // null, which is what produced "NaN Term" client-side. plan_type +
  // billing_cycle are the fields that are actually populated.

  const { data: paymentHistory } = await supabase

    .from('subscription_payments')

    .select('id, amount_paid, currency_used, paid_at, plan_type, billing_cycle, receipt_number')

    .eq('school_id', profile.school_id)

    .not('paid_at', 'is', null)

    .order('paid_at', { ascending: false })

    .limit(10)

  // Get billing snapshots — the locked "what this period cost and why"
  // record, distinct from the payment-attempt rows above (one payment
  // attempt could in principle fail and retry; a snapshot is only ever
  // written once, at successful activation).

  const { data: billingSnapshots } = await supabase

    .from('subscription_billing_snapshots')

    .select('id, billing_cycle, billable_student_count, rate_per_student, tier_label, amount_ngn, discount_applied_ngn, period_start, period_end, created_at')

    .eq('school_id', profile.school_id)

    .order('created_at', { ascending: false })

    .limit(10)



  return (

    <SubscriptionClient

      school={school}

      subscription={subscription}

      studentCount={studentCount ?? 0}

      paymentHistory={paymentHistory ?? []}

      billingSnapshots={billingSnapshots ?? []}

      userId={user.id}

      principalName={profile.full_name}

    />

  )

}

