import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import SchoolDetailClient from './SchoolDetailClient'

export default async function SchoolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/super-admin/login')

  const { data: sa } = await supabase
    .from('platform_admins').select('id').eq('id', user.id).single()
  if (!sa) redirect('/login')

  const [
    { data: school },
    { data: payments },
    { data: staff },
    { data: reminders },
    { data: compliance },
  ] = await Promise.all([
    supabase.from('school_subscription_summary').select('*').eq('id', id).single(),
    supabase.from('school_payments')
      .select('id, payment_type, amount_ngn, plan, payment_ref, confirmed_at')
      .eq('school_id', id)
      .order('confirmed_at', { ascending: false }),
    supabase.from('profiles')
      .select('id, full_name, role, default_code, email, created_at, last_sign_in_at')
      .eq('school_id', id)
      .order('role', { ascending: true })
      .limit(50),
    supabase.from('trial_reminders')
      .select('day_trigger, sent_at, channel')
      .eq('school_id', id)
      .order('sent_at', { ascending: false }),
    supabase.from('school_compliance_records')
      .select('*')
      .eq('school_id', id)
      .maybeSingle(),
  ])

  if (!school) notFound()

  return (
    <SchoolDetailClient
      school={school}
      payments={payments ?? []}
      staff={staff ?? []}
      reminders={reminders ?? []}
      adminId={user.id}
      compliance={compliance ?? null}
    />
  )
    }
