// src/app/dashboard/bursar/record-payment/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import RecordPaymentClient from './RecordPaymentClient'

export const metadata = { title: 'Record Payment — SchoolOS' }

export interface SchoolInfo {
  school_id:    string
  school_name:  string
  current_term: string
  current_year: string
}

export default async function RecordPaymentPage() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  // Fetch profile + school exactly like every other bursar page
  const [profileRes, rateRes] = await Promise.all([
    supabase.from('profiles').select('*, schools(*)').eq('id', user.id).single(),
    supabase.from('exchange_rates').select('usd_rate, updated_at').eq('currency_pair', 'USD_NGN').maybeSingle(),
  ])

  const profile = profileRes.data
  const school  = (profile as any)?.schools ?? null

  const schoolInfo: SchoolInfo = {
    school_id:    school?.id    ?? '',
    school_name:  school?.name  ?? 'School',
    current_term: 'First Term',
    current_year: String(new Date().getFullYear()),
  }

  return (
    <RecordPaymentClient
      userId={user.id}
      profile={profile}
      school={school}
      bursarId={user.id}
      schoolInfo={schoolInfo}
      usdRate={rateRes.data?.usd_rate    ?? 1600}
      rateUpdatedAt={rateRes.data?.updated_at ?? null}
    />
  )
}
