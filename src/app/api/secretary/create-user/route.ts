// src/app/api/secretary/create-user/route.ts
// Uses service role to create auth users — requires SUPABASE_SERVICE_ROLE_KEY env var
import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'

export async function POST(request: Request) {
  try {
    const { fullName, email, role, classId, schoolId } = await request.json()
    if (!fullName || !email || !role) {
      return NextResponse.json(
        { error: 'fullName, email, and role are required' },
        { status: 400 }
      )
    }

    // Verify caller is secretary / admin / principal
    const cookieStore  = await cookies()
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: callerProfile } = await supabaseAuth
      .from('profiles').select('role').eq('id', user.id).single()

    if (
      !callerProfile ||
      !['secretary', 'admin', 'principal'].includes((callerProfile as any).role)
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Admin client with service role key
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Generate access code with role prefix: STU-2026-XXXX, TEA-2026-XXXX etc
    const year    = new Date().getFullYear()
    const rand    = Math.floor(1000 + Math.random() * 9000)
    const prefix  = role.slice(0, 3).toUpperCase()
    const code    = `${prefix}-${year}-${rand}`

    // Generate temp password
    const chars   = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    const special = '@#$!'
    let tempPass  = special[Math.floor(Math.random() * special.length)]
    for (let i = 0; i < 8; i++) tempPass += chars[Math.floor(Math.random() * chars.length)]

    // Try auth.admin.createUser first (needs service role)
    let userId: string | null = null
    let authWarning: string | null = null

    const { data: adminCreateData, error: adminCreateErr } = await adminClient.auth.admin.createUser({
      email:          email.toLowerCase(),
      password:       tempPass,
      email_confirm:  true,
      user_metadata:  { full_name: fullName, role },
    })

    if (adminCreateErr) {
      // Log the real error for debugging
      console.error('auth.admin.createUser failed:', adminCreateErr.message, adminCreateErr)

      // Fallback: try signUp via anon client
      const anonClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      )
      const { data: signUpData, error: signUpErr } = await anonClient.auth.signUp({
        email:    email.toLowerCase(),
        password: tempPass,
        options:  { data: { full_name: fullName, role } },
      })

      if (signUpErr || !signUpData.user) {
        return NextResponse.json(
          { error: `Auth failed: ${adminCreateErr.message} | Fallback: ${signUpErr?.message ?? 'no user returned'}` },
          { status: 400 }
        )
      }
      userId      = signUpData.user.id
      authWarning = 'Created via signUp — email confirmation may be required'
    } else {
      userId = adminCreateData.user.id
    }

    if (!userId) {
      return NextResponse.json({ error: 'Failed to create auth user' }, { status: 500 })
    }

    // Trigger already created the profile row — just update with extra fields
    const { error: profileErr } = await adminClient.from('profiles').update({
      full_name:    fullName,
      role,
      school_id:    schoolId,
      default_code: code,
    }).eq('id', userId)

    if (profileErr) {
      await adminClient.auth.admin.deleteUser(userId)
      return NextResponse.json(
        { error: `Profile error: ${profileErr.message} (${profileErr.code})` },
        { status: 500 }
      )
    }

    // Student profile row if needed
    if (role === 'student') {
      await adminClient.from('student_profiles').insert({
        id:               userId,
        class_id:         classId || null,
        admission_number: `STU-${year}-${rand}`,
        year_of_entry:    year,
      })
    }

    // Audit log (non-critical)
    try {
      await adminClient.from('portal_audit_log').insert({
        action:       'user_created',
        actor_id:     user.id,
        target_table: 'profiles',
        target_id:    userId,
        metadata:     { role, code, school_id: schoolId },
        logged_at:    new Date().toISOString(),
      })
    } catch { /* non-critical */ }

    return NextResponse.json({ code, password: tempPass, userId, message: 'User created successfully', warning: authWarning })

  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? 'Internal error' },
      { status: 500 }
    )
  }
}
