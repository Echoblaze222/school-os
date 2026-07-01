// src/app/api/secretary/reset-password/route.ts
// Resets a user's Supabase Auth password and updates their profile with
// a fresh default_code. Only callable by secretary or principal of the
// same school (verified server-side). Returns the new password so the
// secretary can hand it to the student/staff immediately.

import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'

function makePassword(length = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

export async function POST(request: Request) {
  try {
    const { targetUserId } = await request.json()

    if (!targetUserId) {
      return NextResponse.json({ error: 'targetUserId is required' }, { status: 400 })
    }

    // ── 1. Verify the caller is secretary or principal ──────────────────
    const cookieStore  = await cookies()
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          },
        },
      }
    )

    const { data: { user: caller }, error: authErr } = await supabaseAuth.auth.getUser()
    if (authErr || !caller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: callerProfile } = await supabaseAuth
      .from('profiles')
      .select('role, school_id')
      .eq('id', caller.id)
      .single()

    if (!callerProfile || !['secretary', 'principal'].includes(callerProfile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // ── 2. Verify the target user belongs to the same school ────────────
    const { data: targetProfile } = await supabaseAuth
      .from('profiles')
      .select('school_id, full_name, role')
      .eq('id', targetUserId)
      .single()

    if (!targetProfile || targetProfile.school_id !== callerProfile.school_id) {
      return NextResponse.json({ error: 'User not found in your school' }, { status: 404 })
    }

    // ── 3. Generate new password and reset via admin client ─────────────
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const newPassword = makePassword()

    const { error: resetErr } = await adminClient.auth.admin.updateUserById(
      targetUserId,
      { password: newPassword }
    )

    if (resetErr) {
      return NextResponse.json({ error: resetErr.message }, { status: 500 })
    }

    // ── 4. Log the reset (optional audit trail) ─────────────────────────
    try {
      await adminClient.from('portal_audit_log').insert({
        school_id:  callerProfile.school_id,
        actor_id:   caller.id,
        action:     'password_reset',
        target_id:  targetUserId,
        details:    `Password reset for ${targetProfile.full_name} (${targetProfile.role}) by ${callerProfile.role}`,
      })
    } catch (_) {} // silent — audit log is best-effort

    return NextResponse.json({ password: newPassword })

  } catch (err: any) {
    console.error('[reset-password]', err)
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 })
  }
}
