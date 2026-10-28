// src/app/super-admin/content/page.tsx
// Phase 4, Lane H (§55). Same auth-gate pattern as reports/page.tsx.

import { getAuthUser } from '@/lib/supabase/authUser'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ContentClient from './ContentClient'

export default async function ContentPage() {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) redirect('/super-admin/login')

  const { data: sa } = await supabase
    .from('platform_admins').select('id').eq('id', user.id).single()
  if (!sa) redirect('/login')

  return <ContentClient />
}
