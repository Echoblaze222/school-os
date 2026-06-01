// src/app/dashboard/bursar/record-payment/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import RecordPaymentClient from './RecordPaymentClient'

export const metadata = { title: 'Record Payment — SchoolOS' }
export interface ExchangeRate { usd_rate: number; updated_at: string }
export interface SchoolInfo { school_id: string; school_name: string; current_term: string; current_year: string }

export default async function RecordPaymentPage() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  const [schoolRes, rateRes] = await Promise.all([
    supabase.from('school_settings').select('school_id, school_name, current_term, current_year').maybeSingle(),
    supabase.from('exchange_rates').select('usd_rate, updated_at').eq('currency_pair','USD_NGN').maybeSingle(),
  ])

  return (
    <RecordPaymentClient
      bursarId={user.id}
      schoolInfo={schoolRes.data as SchoolInfo ?? { school_id:'', school_name:'School', current_term:'First Term', current_year: String(new Date().getFullYear()) }}
      usdRate={rateRes.data?.usd_rate ?? 1600}
      rateUpdatedAt={rateRes.data?.updated_at ?? null}
    />
  )
}
