// src/app/dashboard/bursar/ai/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import UniversalAIPage from '@/components/UniversalAIPage'

export const metadata = { title: 'AI Assistant — Bursar | SchoolOS' }

export default async function BursarAIPage() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  const [profileRes, schoolRes] = await Promise.all([
    supabase.from('staff_profiles').select('full_name').eq('user_id', user.id).maybeSingle(),
    supabase.from('school_settings').select('id, school_name, primary_color').maybeSingle(),
  ])

  // Bursar dashboard reads from staff_profiles/school_settings rather than
  // profiles/schools — shim both into the shape UniversalAIPage expects.
  const profile = { full_name: profileRes.data?.full_name ?? 'Bursar' }
  const school  = {
    id:            schoolRes.data?.id,
    name:          schoolRes.data?.school_name ?? 'this school',
    primary_color: schoolRes.data?.primary_color,
  }

  return <UniversalAIPage profile={profile} school={school} userId={user.id} role="bursar" />
}
