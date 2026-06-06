// src/app/api/secretary/create-user/route.ts
import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'

export async function POST(request: Request) {
  try {
    const {
      fullName, email, role, classId, schoolId,
      // Extra enrolment fields
      phone, gender, dateOfBirth, address, state,
      admissionNumber, guardianName, guardianPhone,
      qualification, subjectSpecialty,
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
      .from('profiles').select('role').eq('id', user.id).single()

    if (!callerProfile || !['secretary', 'admin', 'principal'].includes((callerProfile as any).role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Admin client with service role key
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Generate access code  e.g. STU-2026-4821
    const year   = new Date().getFullYear()
    const rand   = Math.floor(1000 + Math.random() * 9000)
    const prefix = role.slice(0, 3).toUpperCase()
    const code   = `${prefix}-${year}-${rand}`

    // Generate temp password
    const chars   = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    const special = '@#$!'
    let tempPass  = special[Math.floor(Math.random() * special.length)]
    for (let i = 0; i < 8; i++) tempPass += chars[Math.floor(Math.random() * chars.length)]

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
        email:   email.toLowerCase(),
        password: tempPass,
        options: { data: { full_name: fullName, role } },
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

    if (!userId) return NextResponse.json({ error: 'Failed to create auth user' }, { status: 500 })

    // Build profile update payload — only include fields with values
    const profileUpdate: Record<string, any> = {
      full_name:    fullName,
      role,
      school_id:    schoolId,
      default_code: code,
    }
    if (phone)         profileUpdate.phone          = phone
    if (gender)        profileUpdate.gender         = gender
    if (dateOfBirth)   profileUpdate.date_of_birth  = dateOfBirth
    if (address)       profileUpdate.address        = address
    if (state)         profileUpdate.state          = state

    const { error: profileErr } = await adminClient.from('profiles').update(profileUpdate).eq('id', userId)

    if (profileErr) {
      await adminClient.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: `Profile error: ${profileErr.message}` }, { status: 500 })
    }

    // Student profile row
    if (role === 'student') {
      const studentRow: Record<string, any> = {
        id:            userId,
        class_id:      classId || null,
        year_of_entry: year,
        admission_number: admissionNumber || `STU-${year}-${rand}`,
      }
      if (guardianName)  studentRow.guardian_name  = guardianName
      if (guardianPhone) studentRow.guardian_phone = guardianPhone
      await adminClient.from('student_profiles').insert(studentRow)
    }

    // Staff extra fields — store in profiles metadata or a staff_profiles table if you have one
    if (role !== 'student') {
      const staffUpdate: Record<string, any> = {}
      if (qualification)    staffUpdate.qualification     = qualification
      if (subjectSpecialty) staffUpdate.subject_specialty = subjectSpecialty
      if (Object.keys(staffUpdate).length > 0) {
        await adminClient.from('profiles').update(staffUpdate).eq('id', userId)
      }
    }

    // Audit log
    try {
      await adminClient.from('portal_audit_log').insert({
        action: 'user_created', actor_id: user.id,
        target_table: 'profiles', target_id: userId,
        metadata: { role, code, school_id: schoolId },
        logged_at: new Date().toISOString(),
      })
    } catch { /* non-critical */ }

    return NextResponse.json({ code, password: tempPass, userId, message: 'User created successfully', warning: authWarning })

  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Internal error' }, { status: 500 })
  }
}
