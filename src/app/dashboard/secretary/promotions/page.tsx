// src/app/dashboard/secretary/promotions/page.tsx
// Same feature as the principal's promotions page, reusing that page's
// PromotionsClient - secretary is one of the three roles allowed to manage
// promotions server-side (see ALLOWED_ROLES in the API routes), so this
// just adds the nav-reachable route rather than reimplementing the UI.
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PromotionsClient from '../../principal/promotions/PromotionsClient'
import type { PromotionRow } from '../../principal/promotions/page'

export default async function SecretaryPromotionsPage() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, school_id, schools(*)')
    .eq('id', user.id)
    .single()

  if (!profile || !['principal', 'secretary', 'admin'].includes(profile.role)) {
    redirect('/dashboard/student')
  }

  const school = (profile as any)?.schools ?? null

  const { data: promotions } = await supabase
    .from('school_promotions')
    .select('*')
    .eq('school_id', profile.school_id)
    .order('created_at', { ascending: false })

  return (
    <PromotionsClient
      promotions={(promotions ?? []) as PromotionRow[]}
      userId={user.id}
      profile={profile}
      school={school}
    />
  )
}
