// src/app/dashboard/hostel/ai/page.tsx
//
// Same double-gate pattern as the ICT AI page: this page's own redirect
// (middleware doesn't cover this segment), plus fetchDataContext's own
// requireHostelStaff call inside /api/ai/chat, independent of whatever
// this page does. The page-level gate is never the only thing standing
// between an unauthorized caller and real hostel data.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { requireHostelStaff } from '@/lib/permissions'
import UniversalAIPage from '@/components/UniversalAIPage'

export default async function HostelAiPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const adminClient = createAdminClient()
  const auth = await requireHostelStaff(adminClient, user.id)
  if (!auth) redirect('/dashboard')

  const { data: profile } = await supabase.from('profiles').select('*, schools(*)').eq('id', user.id).single()
  if (!profile?.school_id) redirect('/login')

  const school = (profile as any).schools ?? null
  return <UniversalAIPage profile={profile} school={school} userId={user.id} role="hostel" />
}
