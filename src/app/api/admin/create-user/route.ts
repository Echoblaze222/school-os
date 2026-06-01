// app/api/admin/create-user/route.ts
// Used by secretary and principal to bulk-create accounts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  // Verify the caller is principal or secretary
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: caller } = await supabase
    .from('profiles')
    .select('role, school_id')
    .eq('id', session.user.id)
    .single()

  if (!caller || !['principal','secretary','admin'].includes(caller.role)) {
    return NextResponse.json({ error: 'Only principal or secretary can create users' }, { status: 403 })
  }

  const {
    email, password, full_name, role,
    school_id, default_code, class_level,
  } = await req.json()

  // Validate required fields
  if (!email || !password || !full_name || !role || !school_id || !default_code) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Only allow creating users for the same school
  if (school_id !== caller.school_id) {
    return NextResponse.json({ error: 'Cannot create users for a different school' }, { status: 403 })
  }

  const admin = createAdminClient()

  // 1. Create auth user
  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // skip email confirmation
    user_metadata: { full_name, role },
  })

  if (authErr) {
    // If user already exists, return the error
    return NextResponse.json({ error: authErr.message }, { status: 400 })
  }

  // 2. Create profile
  const { error: profileErr } = await admin.from('profiles').insert({
    id:               authUser.user.id,
    school_id,
    full_name,
    email,
    role,
    default_code,
    class_level:      class_level ?? null,
    onboarding_stage: 2, // force password change on first login
    created_at:       new Date().toISOString(),
  })

  if (profileErr) {
    // Rollback: delete the auth user we just created
    await admin.auth.admin.deleteUser(authUser.user.id)
    return NextResponse.json({ error: profileErr.message }, { status: 500 })
  }

  // 3. Send welcome notification
  await admin.from('notifications').insert({
    user_id:   authUser.user.id,
    school_id,
    title:     '👋 Welcome to SchoolOS!',
    body:      `Hi ${full_name}! Your account has been created. Your login code is ${default_code}. Please change your password on first login.`,
    type:      'system',
  })

  return NextResponse.json({ ok: true, userId: authUser.user.id, default_code })
}
