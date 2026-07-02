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
    .select('id, name, primary_color, logo_url, status, is_platform_active')
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

  // Get payment history
  const { data: paymentHistory } = await supabase
    .from('subscription_payments')
    .select('id, amount_paid, currency_used, paid_at, term, academic_year, receipt_number')
    .eq('school_id', profile.school_id)
    .order('paid_at', { ascending: false })
    .limit(10)

  return (
    <SubscriptionClient
      school={school}
      subscription={subscription}
      studentCount={studentCount ?? 0}
      paymentHistory={paymentHistory ?? []}
      userId={user.id}
      principalName={profile.full_name}
    />
  )
}
