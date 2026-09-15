// src/app/super-admin/ai/page.tsx
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import AiAssistantClient from './AiAssistantClient'

export default async function SuperAdminAiPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/super-admin/login')

  const adminSupabase = createAdminClient()
  const { data: sa } = await adminSupabase
    .from('platform_admins').select('is_super, full_name').eq('id', user.id).maybeSingle()
  if (!sa?.is_super) notFound()

  return <AiAssistantClient adminName={sa.full_name ?? 'there'} />
}
