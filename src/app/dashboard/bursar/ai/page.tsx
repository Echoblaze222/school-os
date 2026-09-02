// src/app/dashboard/bursar/ai/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import UniversalAIPage from '@/components/UniversalAIPage'

export const metadata = { title: 'AI Assistant | Bursar | SchoolOS' }

export default async function BursarAIPage() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  const { data: profileRow } = await supabase
    .from('profiles')
    .select('full_name, schools(id, name, primary_color)')
    .eq('id', user.id)
    .single()

  const schoolRow = Array.isArray(profileRow?.schools) ? profileRow.schools[0] : profileRow?.schools

  const profile = { full_name: profileRow?.full_name ?? 'Bursar' }
  const school  = {
    id:            schoolRow?.id,
    name:          schoolRow?.name ?? 'this school',
    primary_color: schoolRow?.primary_color,
  }

  return <UniversalAIPage profile={profile} school={school} userId={user.id} role="bursar" />
}
