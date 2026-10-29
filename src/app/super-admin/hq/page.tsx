// src/app/super-admin/hq/page.tsx
// Backs the "Analytics" nav item. Still gated on is_super = true
// specifically (not just platform_admins membership), so it stays
// private even if a second platform admin account is ever added.

import { getAuthUser } from '@/lib/supabase/authUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import HqClient from './HqClient'

export default async function HqPage() {
  const user = await getAuthUser()
  if (!user) redirect('/super-admin/login')

  const adminSupabase = createAdminClient()
  const { data: sa } = await adminSupabase
    .from('platform_admins').select('is_super').eq('id', user.id).maybeSingle()

  // 404, not redirect-to-login: a non-super platform admin (if one ever
  // exists) shouldn't even learn this route exists.
  if (!sa?.is_super) notFound()

  return <HqClient />
}
