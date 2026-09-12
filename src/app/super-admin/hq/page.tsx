// src/app/super-admin/hq/page.tsx
// Unlisted dashboard - deliberately not linked from the super-admin nav
// or SuperAdminDashboard.tsx. Gated on is_super = true specifically (not
// just platform_admins membership), so it stays private even if a second
// platform admin account is ever added.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import HqClient from './HqClient'

export default async function HqPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/super-admin/login')

  const adminSupabase = createAdminClient()
  const { data: sa } = await adminSupabase
    .from('platform_admins').select('is_super').eq('id', user.id).maybeSingle()

  // 404, not redirect-to-login: a non-super platform admin (if one ever
  // exists) shouldn't even learn this route exists.
  if (!sa?.is_super) notFound()

  return <HqClient />
}
