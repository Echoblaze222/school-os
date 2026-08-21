// src/app/dashboard/ict/ai/page.tsx
//
// Note the double gate here, deliberately not simplified to one check:
// (1) this page's own redirect, same as every other page under
// /dashboard/ict, since middleware doesn't cover this segment (see
// layout.tsx's header comment); (2) fetchDataContext's own
// requireIctAccess call inside /api/ai/chat, independent of whatever
// this page does. Never rely on a page-level gate as the only thing
// standing between an unauthorized caller and real data, the route
// re-checks for exactly that reason.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getIctAppointment } from '@/lib/permissions'
import UniversalAIPage from '@/components/UniversalAIPage'

export default async function IctAiPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*, schools(*)').eq('id', user.id).single()
  if (!profile?.school_id) redirect('/login')

  const admin = createAdminClient()
  const appointment = await getIctAppointment(admin, user.id, profile.school_id)
  if (!appointment) redirect('/dashboard')

  const school = (profile as any).schools ?? null
  return <UniversalAIPage profile={profile} school={school} userId={user.id} role="ict" />
}
