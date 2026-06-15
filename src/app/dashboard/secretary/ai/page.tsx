// src/app/dashboard/secretary/ai/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AISecretaryClient from './AISecretaryClient'

export default async function SecretaryAIPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'secretary') redirect('/login')

  const school = (profile as any)?.schools ?? null

  const systemPrompt = "You are an intelligent school secretary assistant for " + (school?.name ?? 'the school') + ". You help with: drafting official letters and communications, managing admissions queries, student record guidance, scheduling and calendar planning, notice writing, and general administrative tasks. Be professional, concise, and helpful."

  return (
    <AISecretaryClient
      secretaryName={profile?.full_name ?? 'Secretary'}
      schoolName={school?.name ?? 'School'}
      systemPrompt={systemPrompt}
    />
  )
}
