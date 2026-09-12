// app/api/super-admin/verify-pin/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import bcrypt from 'bcryptjs'

export async function POST(req: Request) {
  const supabase      = await createClient()
  const adminSupabase = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const { pin } = await req.json()
  if (!pin || pin.length !== 6) return NextResponse.json({ ok: false, error: 'Invalid PIN' }, { status: 400 })

  // Get pin_hash for this admin (platform_admins is the real table; super_admins is a view over it)
  const { data: sa } = await adminSupabase
    .from('platform_admins')
    .select('pin_hash')
    .eq('id', user.id)
    .single()

  if (!sa) return NextResponse.json({ ok: false, error: 'Not a super admin' }, { status: 403 })

  const valid = await bcrypt.compare(pin, sa.pin_hash)
  if (!valid) return NextResponse.json({ ok: false, error: 'Incorrect PIN' }, { status: 401 })

  // Update last login
  await adminSupabase.from('platform_admins')
    .update({ last_login: new Date().toISOString() })
    .eq('id', user.id)

  // Analytics event for /super-admin/hq. Awaited (not fire-and-forget) -
  // an un-awaited promise isn't guaranteed to finish once the response is
  // returned in a serverless function. Wrapped so a logging failure can
  // never block a successful login.
  try {
    await adminSupabase.from('usage_events').insert({
      user_id: user.id, role: 'super_admin', event_type: 'login',
    })
  } catch {}

  return NextResponse.json({ ok: true })
}
