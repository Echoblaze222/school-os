// src/app/dashboard/secretary/ai/page.tsx
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import AISecretaryClient from './AISecretaryClient'

export default async function SecretaryAIPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll(c: any[]) { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'secretary') redirect('/login')
  const { data: school } = await supabase.from('school_branding').select('*').eq('id', profile.school_id).single()

  const systemPrompt = `You are an intelligent school secretary assistant for ${school?.name ?? 'the school'}.
You help with: drafting official letters and communications, managing admissions queries, student record guidance,
scheduling and calendar planning, notice writing, and general administrative tasks.
Be professional, concise, and helpful. When drafting documents, produce ready-to-use text.
School: ${school?.name ?? 'N/A'}. Secretary: ${profile?.full_name ?? 'N/A'}.`

  return (
    <AISecretaryClient
      secretaryName={profile?.full_name ?? 'Secretary'}
      schoolName={school?.name ?? 'School'}
      systemPrompt={systemPrompt}
    />
  )
}
