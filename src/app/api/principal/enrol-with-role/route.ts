// src/app/api/principal/enrol-with-role/route.ts
//
// Closes the gap create-user/route.ts always had for appointment roles:
// that route only ever writes profiles.role, so a brand-new hire who
// needs to be Counselor/Coach/HOD/etc on day one had no single-step
// path - the principal had to create them as a plain teacher first,
// then separately find them in Leadership & Appointments to appoint
// them. This route does both in one write, atomically enough that a
// failed appointment insert never costs the account or its access code
// (see the try/catch around it below).
//
// Deliberately principal-only (not secretary) and deliberately teacher-
// base-role-only: every AppointmentTypeId this route accepts has
// baseRoleScope including 'teacher' - student-scoped types (head_boy,
// head_girl, class_prefect, hostel_prefect) are rejected here with a
// pointer to Leadership & Appointments instead, since those need an
// EXISTING student picked from the roster, not a new account.
//
// Account-creation logic below mirrors secretary/create-user/route.ts
// closely (access code format, temp password, onboarding stage,
// welcome email) rather than importing from it - duplicated on purpose
// so this route can't destabilize the already-working create-user path,
// and because the two routes' permission/role rules genuinely differ
// (this one is principal-only, appointment-role-only).

import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { APPOINTMENT_TYPES, type AppointmentTypeId } from '@/lib/supabase/appointments-types'

const HOSTEL_SCOPED_TYPES = new Set<AppointmentTypeId>(['warden', 'assistant_warden', 'house_parent', 'hostel_administrator'])

export async function POST(request: Request) {
  try {
    const {
      fullName, email, phone, gender, dateOfBirth, address, state,
      qualification, subjectSpecialty,
      appointmentType, departmentId, departmentIds, hostelIds, portfolio,
    } = await request.json()

    if (!fullName || !email) {
      return NextResponse.json({ error: 'fullName and email are required' }, { status: 400 })
    }

    let appointmentConfig: (typeof APPOINTMENT_TYPES)[AppointmentTypeId] | null = null
    if (appointmentType) {
      appointmentConfig = APPOINTMENT_TYPES[appointmentType as AppointmentTypeId] ?? null
      if (!appointmentConfig) {
        return NextResponse.json({ error: 'Unknown appointment type.' }, { status: 400 })
      }
      if (!appointmentConfig.baseRoleScope.includes('teacher')) {
        return NextResponse.json({
          error: `${appointmentConfig.label} is assigned to an existing student, not created as a new account here - use Leadership & Appointments instead.`,
        }, { status: 400 })
      }
    }

    const cookieStore = await cookies()
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

    const { data: callerProfile } = await supabaseAuth.from('profiles').select('role, school_id').eq('id', user.id).single()
    if (!callerProfile || (callerProfile as any).role !== 'principal') {
      return NextResponse.json({ error: 'Only the principal can enrol staff with an appointment role.' }, { status: 403 })
    }
    const schoolId = (callerProfile as any).school_id as string

    // Validate scope inputs up front, before touching auth - a bad
    // department/hostel id should fail loudly, not after an account and
    // access code already exist for nothing.
    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    if (appointmentType === 'hod') {
      if (!departmentId) return NextResponse.json({ error: 'A department is required for Head of Department.' }, { status: 400 })
      const { data: dept } = await admin.from('departments').select('id').eq('id', departmentId).eq('school_id', schoolId).single()
      if (!dept) return NextResponse.json({ error: 'Department not found at your school.' }, { status: 400 })
    }
    if (appointmentType === 'vice_principal' && Array.isArray(departmentIds) && departmentIds.length > 0) {
      const { data: depts } = await admin.from('departments').select('id').eq('school_id', schoolId).in('id', departmentIds)
      if ((depts ?? []).length !== departmentIds.length) {
        return NextResponse.json({ error: 'One or more selected departments could not be found at your school.' }, { status: 400 })
      }
    }
    if (appointmentType && HOSTEL_SCOPED_TYPES.has(appointmentType as AppointmentTypeId)) {
      if (!Array.isArray(hostelIds) || hostelIds.length === 0) {
        return NextResponse.json({ error: 'At least one hostel is required for this role.' }, { status: 400 })
      }
      const { data: hostelRows } = await admin.from('hostels').select('id').eq('school_id', schoolId).in('id', hostelIds)
      if ((hostelRows ?? []).length !== hostelIds.length) {
        return NextResponse.json({ error: 'One or more selected hostels could not be found at your school.' }, { status: 400 })
      }
    }

    // ── Account creation (mirrors secretary/create-user/route.ts) ──
    const year   = new Date().getFullYear()
    const rand   = crypto.randomBytes(6).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
    const prefix = (appointmentType ? String(appointmentType).slice(0, 3) : 'TEA').toUpperCase()
    const code   = `${prefix}-${year}-${rand}`
    const tempPass = crypto.randomUUID() + crypto.randomUUID()

    let userId: string | null = null
    let authWarning: string | null = null

    const { data: adminCreateData, error: adminCreateErr } = await admin.auth.admin.createUser({
      email: email.toLowerCase(),
      password: tempPass,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: 'teacher' },
    })

    if (adminCreateErr) {
      console.error('auth.admin.createUser failed:', adminCreateErr.message)
      const anonClient = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      )
      const { data: signUpData, error: signUpErr } = await anonClient.auth.signUp({
        email: email.toLowerCase(),
        password: tempPass,
        options: { data: { full_name: fullName, role: 'teacher' } },
      })
      if (signUpErr || !signUpData.user) {
        return NextResponse.json(
          { error: `Auth failed: ${adminCreateErr.message} | Fallback: ${signUpErr?.message ?? 'no user returned'}` },
          { status: 400 }
        )
      }
      userId = signUpData.user.id
      authWarning = 'Created via signUp, email confirmation may be required'
    } else {
      userId = adminCreateData.user.id
    }
    if (!userId) return NextResponse.json({ error: 'Failed to create auth user' }, { status: 500 })

    // handle_new_user auto-inserts a blank profiles row the instant
    // auth.admin.createUser succeeds - same collision already fixed
    // twice elsewhere in this codebase (api/schools/register/route.ts,
    // api/super-admin/create-school/route.ts): this table has guard
    // triggers that block changing your own role AND your own school_id
    // via UPDATE, and can't tell "system setting these for the first
    // time" apart from "user tampering with their own row". This route
    // was hitting BOTH guards at once (previously two separate .update()
    // calls setting role/school_id, then qualification/subjectSpecialty
    // afterward) - deleting the trigger-created row first and doing one
    // plain INSERT avoids both, and folds what used to be two round
    // trips into one.
    await admin.from('profiles').delete().eq('id', userId)

    const profileInsert: Record<string, any> = {
      id: userId,
      full_name: fullName,
      role: 'teacher',
      school_id: schoolId,
      default_code: code,
      onboarding_stage: 'stage_1_pending',
    }
    if (phone) profileInsert.phone = phone
    if (gender) profileInsert.gender = gender
    if (dateOfBirth) profileInsert.date_of_birth = dateOfBirth
    if (address) profileInsert.address = address
    if (state) profileInsert.state = state
    if (qualification) profileInsert.qualification = qualification
    if (subjectSpecialty) profileInsert.subject_specialty = subjectSpecialty

    const { error: profileErr } = await admin.from('profiles').insert(profileInsert)
    if (profileErr) {
      await admin.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: `Profile error: ${profileErr.message}` }, { status: 500 })
    }

    // ── Appointment (the actual new capability this route adds) ──
    let appointmentWarning: string | null = null
    if (appointmentType) {
      const scope: Record<string, unknown> = {}
      if (appointmentType === 'vice_principal') {
        if (portfolio) scope.portfolio = portfolio
        if (Array.isArray(departmentIds) && departmentIds.length > 0) scope.department_ids = departmentIds
      }
      if (HOSTEL_SCOPED_TYPES.has(appointmentType as AppointmentTypeId)) {
        scope.hostel_ids = hostelIds
      }

      const { error: apptErr } = await admin.from('appointments').insert({
        school_id: schoolId,
        profile_id: userId,
        appointment_type: appointmentType,
        department_id: appointmentType === 'hod' ? departmentId : null,
        scope,
        assigned_by: user.id,
        status: 'active',
      })

      if (apptErr) {
        // Account and code are already real and usable - don't roll
        // those back over an appointment failure. Surface it as a
        // warning instead: the code still works, the principal just
        // needs to appoint the role separately from Leadership.
        console.error('enrol-with-role: appointment insert failed:', apptErr.message)
        appointmentWarning = `Account created, but the ${appointmentConfig?.label ?? 'role'} assignment failed: ${apptErr.message}. Appoint it from Leadership & Appointments instead.`
      }
    }

    try {
      await admin.from('portal_audit_log').insert({
        action: 'user_created_with_role',
        actor_id: user.id,
        target_table: 'profiles',
        target_id: userId,
        metadata: { role: 'teacher', appointmentType: appointmentType ?? null, code, school_id: schoolId },
        logged_at: new Date().toISOString(),
      })
    } catch { /* non-critical */ }

    return NextResponse.json({
      code,
      userId,
      message: 'User created successfully',
      warning: authWarning ?? appointmentWarning,
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Internal error' }, { status: 500 })
  }
}
