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

    // Create auth user — if orphaned auth user exists (no profile), clean up and retry
    let createResult = await adminClient.auth.admin.createUser({
      email:          email.toLowerCase(),
      password:       tempPass,
      email_confirm:  true,
      user_metadata:  { full_name: fullName, role },
    })

    if (createResult.error) {
      const msg = createResult.error.message.toLowerCase()
      if (msg.includes('already') || msg.includes('database error')) {
        // Check for orphaned auth user with no profile
        const { data: existingUsers } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
        const orphan = existingUsers?.users?.find(
          u => u.email?.toLowerCase() === email.toLowerCase()
        )
        if (orphan) {
          const { data: existingProfile } = await adminClient
            .from('profiles').select('id').eq('id', orphan.id).maybeSingle()
          if (!existingProfile) {
            // Orphaned — delete and retry
            await adminClient.auth.admin.deleteUser(orphan.id)
            createResult = await adminClient.auth.admin.createUser({
              email:          email.toLowerCase(),
              password:       tempPass,
              email_confirm:  true,
              user_metadata:  { full_name: fullName, role },
            })
          } else {
            return NextResponse.json(
              { error: 'A user with this email already exists.' },
              { status: 400 }
            )
          }
        }
      }
      if (createResult.error) {
        return NextResponse.json({ error: createResult.error.message }, { status: 400 })
      }
    }

    const newUser = createResult.data
    const userId  = newUser.user.id

    // Create profile
    const { error: profileErr } = await adminClient.from('profiles').insert({
      id:               userId,
      full_name:        fullName,
      email:            email.toLowerCase(),
      role,
      school_id:        schoolId,
      is_active:        true,
      default_code:     code,
      onboarding_stage: 'start',
      created_at:       new Date().toISOString(),
    })

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
        user_id:           userId,
        full_name:         fullName,
        school_id:         schoolId,
        class_id:          classId || null,
        student_number:    `${year}/${rand}`,
        onboarding_status: 'incomplete',
      })
    }

    // Audit log (non-critical)
    try {
      await adminClient.from('portal_audit_log').insert({
        action:         'user_created',
        performed_by:   user.id,
        target_user_id: userId,
        details:        { role, code, school_id: schoolId },
        created_at:     new Date().toISOString(),
      })
    } catch { /* non-critical */ }

    return NextResponse.json({ code, password: tempPass, userId, message: 'User created successfully' })

  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? 'Internal error' },
      { status: 500 }
    )
  }
}
