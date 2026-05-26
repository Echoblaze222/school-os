import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import SchoolDetailClient from './SchoolDetailClient'

export default async function SchoolDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/super-admin/login')

  const { data: sa } = await supabase
    .from('super_admins').select('id').eq('id', session.user.id).single()
  if (!sa) redirect('/login')

  const [
    { data: school },
    { data: payments },
    { data: staff },
    { data: reminders },
  ] = await Promise.all([
    supabase.from('school_subscription_summary').select('*').eq('id', params.id).single(),
    supabase.from('school_payments')
      .select('id, payment_type, amount_ngn, plan, payment_ref, confirmed_at')
      .eq('school_id', params.id)
      .order('confirmed_at', { ascending: false }),
    supabase.from('profiles')
      .select('id, full_name, role, default_code, email, created_at, last_sign_in_at')
      .eq('school_id', params.id)
      .order('role', { ascending: true })
      .limit(50),
    supabase.from('trial_reminders')
      .select('day_trigger, sent_at, channel')
      .eq('school_id', params.id)
      .order('sent_at', { ascending: false }),
  ])

  if (!school) notFound()

  return (
    <SchoolDetailClient
      school={school}
      payments={payments ?? []}
      staff={staff ?? []}
      reminders={reminders ?? []}
      adminId={session.user.id}
    />
  )
}
