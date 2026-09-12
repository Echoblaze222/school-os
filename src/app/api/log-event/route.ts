// src/app/api/log-event/route.ts
// Records usage_events for the super-admin HQ dashboard (/super-admin/hq).
// This is fire-and-forget from the caller's side - it must never block or
// break a login, so it always resolves 200 quickly and swallows its own
// errors rather than surfacing them to the user.
//
// user_id/role/school_id are resolved server-side from the authenticated
// session, never trusted from the request body - a client could otherwise
// spoof activity for another account or school.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ALLOWED_EVENT_TYPES = ['login', 'activation']

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false }, { status: 200 })

    const body = await req.json().catch(() => ({}))
    const eventType = ALLOWED_EVENT_TYPES.includes(body?.event_type) ? body.event_type : 'login'

    const adminSupabase = createAdminClient()

    // Resolve role/school - check platform_admins first since that table
    // doesn't overlap with profiles (a platform admin has no profiles row).
    const { data: sa } = await adminSupabase
      .from('platform_admins').select('id').eq('id', user.id).maybeSingle()

    let role: string | null = null
    let schoolId: string | null = null

    if (sa) {
      role = 'super_admin'
    } else {
      const { data: profile } = await adminSupabase
        .from('profiles').select('role, school_id').eq('id', user.id).maybeSingle()
      role = profile?.role ?? null
      schoolId = profile?.school_id ?? null
    }

    await adminSupabase.from('usage_events').insert({
      user_id: user.id,
      school_id: schoolId,
      role,
      event_type: eventType,
    })

    return NextResponse.json({ ok: true })
  } catch {
    // Analytics logging must never surface an error to the caller.
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
