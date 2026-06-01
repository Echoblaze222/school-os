// src/app/dashboard/bursar/ai/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AIBursarClient from './AIBursarClient'

export const metadata = { title: 'AI Assistant — Bursar | SchoolOS' }

export default async function BursarAIPage() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  const [profileRes, schoolRes] = await Promise.all([
    supabase.from('staff_profiles').select('full_name').eq('user_id', user.id).maybeSingle(),
    supabase.from('school_settings').select('school_name').maybeSingle(),
  ])

  const bursarName = profileRes.data?.full_name ?? 'Bursar'
  const schoolName = schoolRes.data?.school_name ?? 'this school'

  const systemPrompt = `You are a finance assistant for the Bursar of ${schoolName}. Help answer fee-related questions, explain payment summaries in plain language, identify students with long overdue fees, and help draft fee reminder messages. Be clear and precise with numbers. Always show figures in both NGN and USD equivalents when relevant (use approximate rate of ₦1,600 per $1 unless told otherwise). Format financial data in clear tables or lists.`

  return <AIBursarClient bursarName={bursarName} schoolName={schoolName} systemPrompt={systemPrompt} />
}
