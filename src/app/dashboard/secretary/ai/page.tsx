// src/app/dashboard/secretary/ai/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AISecretaryClient from './AISecretaryClient'

export const metadata = { title: 'AI Assistant — Secretary | SchoolOS' }

export default async function SecretaryAIPage() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  const [profileRes, schoolRes] = await Promise.all([
    supabase.from('staff_profiles').select('full_name').eq('user_id', user.id).maybeSingle(),
    supabase.from('school_settings').select('school_name').maybeSingle(),
  ])

  const secretaryName = profileRes.data?.full_name ?? 'Secretary'
  const schoolName    = schoolRes.data?.school_name ?? 'this school'

  const systemPrompt = `You are an administrative assistant for the Secretary of ${schoolName}. Help draft official letters and documents, provide templates for common admin tasks, assist with data organisation, and answer questions about school administration procedures. Be professional, precise, and well-structured in all communications. When writing letters, follow formal Nigerian school letter formats.`

  return <AISecretaryClient secretaryName={secretaryName} schoolName={schoolName} systemPrompt={systemPrompt} />
}
