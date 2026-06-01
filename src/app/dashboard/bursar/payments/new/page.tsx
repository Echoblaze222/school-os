// src/app/dashboard/bursar/payments/new/page.tsx
// Server Component — auth guard only; all data fetching done client-side via Supabase search

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NewPaymentClient from './NewPaymentClient'

export default async function NewPaymentPage() {
  const supabase = await createClient()

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (!profile || !['bursar', 'admin', 'principal'].includes(profile.role)) {
    redirect('/dashboard/student')
  }

  return <NewPaymentClient bursarId={user.id} bursarName={profile.full_name ?? 'Bursar'} />
}
