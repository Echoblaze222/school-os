// app/api/super-admin/verify-pin/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import bcrypt from 'bcryptjs'

export async function POST(req: Request) {
  const supabase      = createClient()
  const adminSupabase = createAdminClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const { pin } = await req.json()
  if (!pin || pin.length !== 6) return NextResponse.json({ ok: false, error: 'Invalid PIN' }, { status: 400 })

  // Get pin_hash for this admin
  const { data: sa } = await adminSupabase
    .from('super_admins')
    .select('pin_hash')
    .eq('id', session.user.id)
    .single()

  if (!sa) return NextResponse.json({ ok: false, error: 'Not a super admin' }, { status: 403 })

  const valid = await bcrypt.compare(pin, sa.pin_hash)
  if (!valid) return NextResponse.json({ ok: false, error: 'Incorrect PIN' }, { status: 401 })

  // Update last login
  await adminSupabase.from('super_admins')
    .update({ last_login: new Date().toISOString() })
    .eq('id', session.user.id)

  return NextResponse.json({ ok: true })
}
