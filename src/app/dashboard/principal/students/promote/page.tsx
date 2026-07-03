// src/app/dashboard/principal/students/promote/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PromoteClient from './PromoteClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Promote Students — SchoolOS' }

export default async function PromotePage() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  // FIX: was querying school_branding separately (stale/different table
  // from `schools`, source of the purple-instead-of-brand-colour bug).
  // Mirrors the school_id, primary_color pattern from principal/page.tsx.
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'principal') redirect('/login')

  const school = (profile as any)?.schools ?? null

  return (
    <PromoteClient
      userId={user.id}
      profile={profile}
      school={school}
      role={profile.role}
      schoolId={profile.school_id}
      schoolColor={school?.primary_color ?? '#7C3AED'}
    />
  )
}
