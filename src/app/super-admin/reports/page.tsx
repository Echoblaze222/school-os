// src/app/super-admin/reports/page.tsx
// Phase 4, Lane G (§52, §62) - review queue for content_reports. Server
// component just gates on auth/role and hands off to the client for data
// (content_reports has no client-readable RLS policy by design, so this
// goes through /api/super-admin/reports rather than a direct table read -
// see that route + the table comment in the Lane G/H/I migration).

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ReportsClient from './ReportsClient'

export default async function ReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/super-admin/login')

  const { data: sa } = await supabase
    .from('platform_admins').select('id').eq('id', user.id).single()
  if (!sa) redirect('/login')

  return <ReportsClient />
}
