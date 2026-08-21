// src/app/api/secretary/create-user/route.ts
import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'
import crypto                 from 'crypto'

export async function POST(request: Request) {
  try {
    const {
      fullName, email, role, classId, schoolId,
      // Extra enrolment fields
      phone, gender, dateOfBirth, address, state,
      admissionNumber, guardianName, guardianPhone,
      qualification, subjectSpecialty,
      // Parent-specific fields
      studentId, relationship, occupation,
    } = await request.json()

    if (!fullName || !email || !role) {
      return NextResponse.json({ error: 'fullName, email, and role are required' }, { status: 400 })
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
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          },
        },
      }
    )

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: callerProfile } = await supabaseAuth
      .from('profiles').select('role, school_id').eq('id', user.id).single()

    const callerRole = (callerProfile as any)?.role as string | undefined

    if (!callerProfile || !['secretary', 'admin', 'principal'].includes(callerRole ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Role-escalation guard - the frontend dropdown already limits which
    // roles each caller can assign, but that is a UI convenience only.
    // A secretary token replayed with role: "principal" (or any other
    // elevated role) must be rejected here too, or the client-side
    // restriction is worthless. This list must stay in sync with
    // ROLES_ASSIGNABLE in the secretary/principal CodesClient.tsx files.
    const ROLES_CALLER_CAN_ASSIGN: Record<string, string[]> = {
      secretary: ['student', 'parent'],
      principal: ['student', 'teacher', 'bursar', 'secretary', 'librarian', 'nurse', 'parent'],
      admin:     ['student', 'teacher', 'bursar', 'secretary', 'librarian', 'nurse', 'parent'],
    }
    const allowedRoles = ROLES_CALLER_CAN_ASSIGN[callerRole ?? ''] ?? []
    if (!allowedRoles.includes(role)) {
      return NextResponse.json({ error: `You are not permitted to create a ${role} account.` }, { status: 403 })
    }

    // Admin client with service role key
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Generate access code, e.g. STU-2026-K7XQPM
    // The random segment MUST be long and cryptographically random. It is
    // the sole credential needed to activate an account (see
    // auth/first-login), so a short Math.random() suffix (previously a
    // 4-digit number with only 9,000 possibilities and no rate limiting)
    // let anyone brute-force their way into hijacking any unactivated
    // account before the real user's first login.
    const year   = new Date().getFullYear()
    const rand   = crypto.randomBytes(6).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
    const prefix = role.slice(0, 3).toUpperCase()
    const code   = `${prefix}-${year}-${rand}`

    // Supabase auth requires a password on user creation, but this account is
    // never meant to be signed into with it - activation happens entirely via
    // the access code + a password the user sets themselves on first login
    // (see /api/auth/first-login). So this is thrown away immediately: long,
    // random, never logged, never emailed, never shown in any UI.
    const tempPass = crypto.randomUUID() + crypto.randomUUID()

    // Create auth user
    let userId: string | null = null
    let authWarning: string | null = null

    const { data: adminCreateData, error: adminCreateErr } = await adminClient.auth.admin.createUser({
      email:         email.toLowerCase(),
      password:      tempPass,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    })

    if (adminCreateErr) {
      console.error('auth.admin.createUser failed:', adminCreateErr.message)
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
      authWarning = 'Created via signUp, email confirmation may be required'
    } else {
      userId = adminCreateData.user.id
    }

    if (!userId) return NextResponse.json({ error: 'Failed to create auth user' }, { status: 500 })

    // Every account created via access code - regardless of role - must
    // start at 'stage_1_pending'. That's the ONLY stage /api/auth/first-login
    // accepts for activation (see isFirstLogin there); anything else causes
    // an immediate, permanent "Account already activated" error the very
    // first time the person ever tries their code. Onboarding then advances
    // them to stage 2 itself once activation succeeds - this route should
    // never pre-skip that step for any role.
    const onboardingStage = 'stage_1_pending'

    // If a classId was given, resolve the class name so we can write class_level to profiles
    let resolvedClassName: string | null = null
    if (classId) {
      const { data: classRow } = await adminClient
        .from('classes').select('name').eq('id', classId).single()
      resolvedClassName = classRow?.name ?? null
    }

    // Build profile update payload - only include fields with values
    // school_id is always the caller's own school - never trust a
    // client-supplied schoolId here, or a secretary at School A could
    // create accounts inside School B by editing the request body.
    const profileUpdate: Record<string, any> = {
      full_name:        fullName,
      role,
      school_id:        (callerProfile as any).school_id,
      default_code:     code,
      onboarding_stage: onboardingStage,
    }
    if (phone)             profileUpdate.phone         = phone
    if (gender)            profileUpdate.gender        = gender
    if (dateOfBirth)       profileUpdate.date_of_birth = dateOfBirth
    if (address)           profileUpdate.address       = address
    if (state)             profileUpdate.state         = state
    // ✅ Write class_level (text name) to profiles so Students page groups correctly
    if (resolvedClassName) profileUpdate.class_level   = resolvedClassName

    const { error: profileErr } = await adminClient.from('profiles').update(profileUpdate).eq('id', userId)

    if (profileErr) {
      await adminClient.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: `Profile error: ${profileErr.message}` }, { status: 500 })
    }

    // Student profile row
    if (role === 'student') {
      const studentRow: Record<string, any> = {
        id:               userId,
        class_id:         classId || null,
        year_of_entry:    year,
        admission_number: admissionNumber || `STU-${year}-${rand}`,
      }
      if (guardianName)  studentRow.guardian_name  = guardianName
      if (guardianPhone) studentRow.guardian_phone = guardianPhone
      await adminClient.from('student_profiles').insert(studentRow)
    }

    // Staff extra fields
    if (role !== 'student' && role !== 'parent') {
      const staffUpdate: Record<string, any> = {}
      if (qualification)    staffUpdate.qualification     = qualification
      if (subjectSpecialty) staffUpdate.subject_specialty = subjectSpecialty
      if (Object.keys(staffUpdate).length > 0) {
        await adminClient.from('profiles').update(staffUpdate).eq('id', userId)
      }
    }

    // Parent profile row + link to the child this code was generated for.
    // studentId is optional (a parent code can be generated before the link
    // is known), but relationship/occupation only matter alongside it.
    if (role === 'parent') {
      const parentRow: Record<string, any> = { id: userId }
      if (occupation)   parentRow.occupation   = occupation
      if (relationship) parentRow.relationship = relationship
      await adminClient.from('parent_profiles').insert(parentRow)

      if (studentId) {
        await adminClient.from('parent_student_links').insert({
          parent_id:  userId,
          student_id: studentId,
        })
      }
    }

    // ✅ Send welcome email with access code (activation is code-only - no password is ever surfaced)
    // Non-fatal - user is already created, email failure should not block the response
    try {
      const resendKey = process.env.RESEND_API_KEY
      if (resendKey) {
        const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL}/login`
        const roleLabel = role.charAt(0).toUpperCase() + role.slice(1)

        await fetch('https://api.resend.com/emails', {
          method:  'POST',
          headers: {
            Authorization:  `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from:    'SchoolOS <onboarding@resend.dev>',
            to:      email.toLowerCase(),
            subject: `🎓 Your SchoolOS Account is Ready, ${fullName}`,
            html: `
              <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0f0f0f;color:#ffffff;border-radius:12px;overflow:hidden;">
                <div style="background:linear-gradient(135deg,#7C3AED,#4F46E5);padding:32px;text-align:center;">
                  <h1 style="margin:0;font-size:26px;color:#fff;">Welcome to SchoolOS 🎓</h1>
                  <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:15px;">Your account has been created</p>
                </div>
                <div style="padding:32px;">
                  <p style="color:#d1d5db;font-size:15px;">Hi <strong style="color:#fff;">${fullName}</strong>,</p>
                  <p style="color:#d1d5db;font-size:15px;">
                    Your <strong style="color:#a78bfa;">${roleLabel}</strong> account on SchoolOS is ready.
                    Use your access code below to log in for the first time and set your password.
                  </p>
                  <div style="background:#1a1a2e;border:1px solid #7C3AED;border-radius:10px;padding:24px;margin:24px 0;">
                    <h3 style="margin:0 0 16px;color:#a78bfa;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Your Login Details</h3>
                    <table style="width:100%;border-collapse:collapse;">
                      <tr>
                        <td style="color:#9ca3af;padding:7px 0;font-size:14px;">Email</td>
                        <td style="color:#fff;font-weight:600;font-size:14px;">${email.toLowerCase()}</td>
                      </tr>
                      <tr>
                        <td style="color:#9ca3af;padding:7px 0;font-size:14px;">Access Code</td>
                        <td style="color:#fff;font-weight:700;font-family:monospace;font-size:18px;letter-spacing:2px;">${code}</td>
                      </tr>
                      <tr>
                        <td style="color:#9ca3af;padding:7px 0;font-size:14px;">Role</td>
                        <td style="color:#a78bfa;font-weight:600;font-size:14px;">${roleLabel}</td>
                      </tr>
                    </table>
                  </div>
                  <p style="color:#f59e0b;font-size:13px;background:#1c1400;border:1px solid #f59e0b;border-radius:8px;padding:12px;">
                    ⚠️ On first login, choose the <strong>Access Code</strong> tab, enter your code above, and set a new password. Keep this email safe.
                  </p>
                  <div style="text-align:center;margin:28px 0;">
                    <a href="${loginUrl}" style="background:linear-gradient(135deg,#7C3AED,#4F46E5);color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;display:inline-block;">
                      Login to SchoolOS →
                    </a>
                  </div>
                  <p style="color:#6b7280;font-size:13px;text-align:center;">
                    Need help? Contact your school administrator.
                  </p>
                </div>
                <div style="background:#111;padding:16px;text-align:center;">
                  <p style="color:#4b5563;font-size:12px;margin:0;">Powered by <strong style="color:#7C3AED;">SchoolOS</strong> · Built for Nigerian Schools</p>
                </div>
              </div>
            `,
          }),
        })
      }
    } catch (emailErr) {
      console.error('Welcome email failed (non-fatal):', emailErr)
    }

    // Audit log
    try {
      await adminClient.from('portal_audit_log').insert({
        action:       'user_created',
        actor_id:     user.id,
        target_table: 'profiles',
        target_id:    userId,
        metadata:     { role, code, school_id: (callerProfile as any).school_id },
        logged_at:    new Date().toISOString(),
      })
    } catch { /* non-critical */ }

    return NextResponse.json({
      code,
      userId,
      message:   'User created successfully',
      warning:   authWarning,
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Internal error' }, { status: 500 })
  }
}
