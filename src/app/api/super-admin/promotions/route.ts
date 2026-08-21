// src/app/api/super-admin/promotions/route.ts
// Lane E, §47 - moderation queue for promotions requiring review
// (sponsored content and scholarships - see requires_moderation in the
// migration). Only platform_admins may call this.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function requirePlatformAdmin() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const
  }

  const admin = createAdminClient()
  const { data: platformAdmin } = await admin
    .from('platform_admins')
    .select('id')
    .eq('id', user.id)
    .single()

  if (!platformAdmin) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) } as const
  }

  return { admin } as const
}

export async function GET() {
  const auth = await requirePlatformAdmin()
  if ('error' in auth) return auth.error

  const { data, error } = await auth.admin
    .from('school_promotions')
    .select('*, schools ( name, city, state )')
    .eq('status', 'pending_review')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[super-admin/promotions] list failed:', error.message)
    return NextResponse.json({ error: 'Couldn\'t load the moderation queue.' }, { status: 500 })
  }

  return NextResponse.json({ promotions: data ?? [] })
}
