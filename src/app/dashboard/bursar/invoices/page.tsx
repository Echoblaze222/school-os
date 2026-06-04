import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import InvoicesClient from './InvoicesClient'

export default async function InvoicesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, school_id')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  const { data: invoices } = await supabase
    .from('payment_invoices')
    .select(`
      id,
      amount_due_ngn,
      amount_paid_ngn,
      balance_ngn,
      status,
      due_date,
      created_at,
      profiles!student_id ( full_name, permanent_student_id, class_level ),
      fee_structures ( description, term, academic_year )
    `)
    .eq('school_id', profile.school_id)
    .order('created_at', { ascending: false })
    .limit(200)

  return (
    <InvoicesClient
      invoices={invoices ?? []}
      schoolId={profile.school_id}
    />
  )
}
