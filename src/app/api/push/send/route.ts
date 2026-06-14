// src/app/api/push/send/route.ts
// Server-side: sends Web Push notifications.
//
// The actual sending logic (sendPushToUsers) now lives in `@/lib/webpush`
// (see audit #104) — this route only handles the HTTP POST contract for the
// principal broadcast panel and re-exports nothing else.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { sendPushToUsers } from '@/lib/webpush'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ── POST /api/push/send — called by principal broadcast panel ─────────────
// Body: { userIds?: string[], targetRole?: string, title, body, url }
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Only principal or admin may call this endpoint
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, school_id')
    .eq('id', user.id)
    .single()

  if (!profile || !['principal', 'admin', 'super-admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { userIds, targetRole, title, body, url } = await req.json()

  if (!title || !body) {
    return NextResponse.json({ error: 'title and body required' }, { status: 400 })
  }

  const admin = adminClient()
  let resolvedUserIds: string[] = userIds ?? []

  // Resolve by role if userIds not provided directly
  if (!resolvedUserIds.length && profile.school_id) {
    let q = admin
      .from('profiles')
      .select('id')
      .eq('school_id', profile.school_id)
      .eq('is_active', true)

    if (targetRole && targetRole !== 'all') {
      q = q.eq('role', targetRole)
    }

    const { data: targets } = await q
    resolvedUserIds = (targets ?? []).map((t: any) => t.id)
  }

  if (!resolvedUserIds.length) {
    return NextResponse.json({ ok: true, sent: 0, message: 'No subscribers found' })
  }

  await sendPushToUsers(resolvedUserIds, { title, body, url: url ?? '/', tag: 'schoolos-broadcast' })

  return NextResponse.json({ ok: true, sent: resolvedUserIds.length })
}
