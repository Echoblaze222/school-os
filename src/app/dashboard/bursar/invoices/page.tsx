import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import InvoicesClient from './InvoicesClient'
import { checkSubscription }  from '@/lib/subscription'       // ← ADD THIS IMPORT
import SubscriptionGate       from '@/components/SubscriptionGate'

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
  // ── Subscription check ───────────────────────────────────────────────────
  // ADD THIS BLOCK to every non-principal dashboard page
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
  // ── End subscription check ───────────────────────────────────────────────

  // ... rest of your existing page data-fetching and return ...
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <InvoicesClient
      invoices={invoices ?? []}
      schoolId={profile.school_id}
    />
  )
}
