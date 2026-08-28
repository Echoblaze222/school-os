// src/app/super-admin/promotions/page.tsx
// Was missing entirely: the moderation queue API and approve/reject action
// already existed (/api/super-admin/promotions, .../[id]/moderate) but
// nothing in super-admin ever rendered a page for it - a school could
// submit a sponsored promotion and it would sit in pending_review forever
// with no UI anywhere to actually review it. Same auth-gate pattern as
// content/page.tsx and reports/page.tsx.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PromotionsModerationClient from './PromotionsModerationClient'

export default async function PromotionsModerationPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/super-admin/login')

  const { data: sa } = await supabase
    .from('platform_admins').select('id').eq('id', user.id).single()
  if (!sa) redirect('/login')

  return <PromotionsModerationClient />
}
