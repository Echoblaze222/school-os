// src/app/dashboard/principal/promotions/page.tsx
// Lane E - school-side promotion management (principal + secretary).
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PromotionsClient from './PromotionsClient'

export interface PromotionRow {
  id: string
  promotion_type: string
  title: string
  summary: string
  body: string | null
  image_url: string | null
  external_link: string | null
  placement: string
  start_date: string
  end_date: string
  is_sponsored: boolean
  status: string
  requires_moderation: boolean
  rejection_reason: string | null
  created_at: string
}

export default async function PromotionsPage() {
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
