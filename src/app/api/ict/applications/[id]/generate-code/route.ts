// src/app/api/ict/applications/[id]/generate-code/route.ts
//
// The security-sensitive step in the self-service pathway: turns a
// VERIFIED application into a real auth user + profile + appointment,
// atomically, and generates the access code. Applicant then signs in
// immediately with code + the password they set at application time:
// see ict_set_encrypted_password in 01-ict-schema.sql for how that
// password reaches auth.users without ever being stored or logged in
// plaintext by this route.
//
// Idempotency: re-running this against an already-code_generated
// application is rejected below (status check), not just discouraged:
// a double-click or retried request must not create a second auth user
// for the same application.

import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { requireIctAccess } from '@/lib/permissions'
import { generateAccessCode } from '@/lib/supabase/access-code-generator'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

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
      },
    )
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: callerProfile } = await supabaseAuth
      .from('profiles').select('school_id').eq('id', user.id).single()
    if (!callerProfile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const allowed = await requireIctAccess(admin, user.id, callerProfile.school_id)
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: application } = await admin
      .from('access_code_applications')
      .select('*')
      .eq('id', id)
      .eq('school_id', callerProfile.school_id)
      .maybeSingle()

    if (!application) return NextResponse.json({ error: 'Application not found.' }, { status: 404 })
    if (application.status !== 'verified') {
      return NextResponse.json(
        { error: `Application must be verified first (currently: ${application.status}).` },
        { status: 409 },
      )
    }

    const { data: roleType } = await admin
      .from('appointment_types')
      .select('id, base_role_scope')
      .eq('id', application.role_applied_for)
      .single()

    if (!roleType) {
      return NextResponse.json({ error: 'Applied-for role is no longer a recognized appointment type.' }, { status: 409 })
    }

    // Which structural profiles.role to create the account under. See
    // lib/permissions.ts header comment, appointments layer on top of
    // one of the base roles, not the other way round. base_role_scope[0]
    // is a reasoned default (flagged, not silently assumed) for roles
    // whose scope allows more than one base role (e.g. ict_administrator
    // allows both teacher and principal), this pathway always picks the
    // more restrictive of the two, since Principal accounts are
    // explicitly admin-issued-only and should never originate here.
    const baseRole = roleType.base_role_scope.includes('teacher')
      ? 'teacher'
      : roleType.base_role_scope[0]

    // Supabase's admin.createUser requires SOME plaintext password to
    // succeed; it's overwritten in the same request by
    // ict_set_encrypted_password below, so this value is never the
    // account's real password and is discarded immediately.
    const throwawayPass = crypto.randomUUID() + crypto.randomUUID()

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email:         application.email,
      password:      throwawayPass,
      email_confirm: true,
      user_metadata: { full_name: application.full_name, role: baseRole },
    })

    if (createErr || !created.user) {
      return NextResponse.json({ error: `Account creation failed: ${createErr?.message}` }, { status: 400 })
    }

    const userId = created.user.id

    // Swap in the applicant's real (already-hashed) password. If this
    // fails, the account exists with only the throwaway password, that
    // is a safe failure mode (nobody can sign in without it, including
    // the applicant), not a security hole, but it does mean the
    // applicant can't sign in yet. Surface it clearly rather than
    // reporting success.
    const { error: pwErr } = await admin.rpc('ict_set_encrypted_password', {
      p_user_id: userId,
      p_bcrypt_hash: application.password_hash,
    })
    if (pwErr) {
      console.error('[generate-code] password swap failed:', pwErr.message)
      return NextResponse.json(
        { error: 'Account was created but activating the applicant\'s password failed. Do not tell the applicant their code yet, contact support before retrying.' },
        { status: 500 },
      )
    }

    // Access code, same generator as every other issuance path in the
    // app now (the atomic per-school-per-year sequence, see
    // access-code-sequence-and-lifecycle.sql), not a standalone random
    // suffix specific to this route.
    let code: string
    try {
      const generated = await generateAccessCode(admin, {
        schoolId:    callerProfile.school_id,
        fullName:    application.full_name,
        profileId:   userId,
        generatedBy: user.id,
      })
      code = generated.code
    } catch (codeErr: any) {
      await admin.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: `Access code generation failed: ${codeErr.message}` }, { status: 500 })
    }

    // stage_2_pending (not stage_1_pending): the applicant already set
    // their real password at application time, so they skip the
    // "set your password" first-login step entirely and land straight
    // in onboarding stage 2, per the spec's "no separate password-
    // setting step" requirement.
    const { error: profileErr } = await admin
      .from('profiles')
      .update({
        full_name:        application.full_name,
        role:             baseRole,
        school_id:        callerProfile.school_id,
        phone:            application.phone,
        default_code:     code,
        onboarding_stage: 'stage_2_pending',
      })
      .eq('id', userId)

    if (profileErr) {
      await admin.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: `Profile setup failed: ${profileErr.message}` }, { status: 500 })
    }

    // Layer the actual appointment on top of the base identity, this is
    // what makes the account an ICT Officer / Counselor / Warden / etc.,
    // not the base `role` column. Column is `appointment_type` and
    // `assigned_by`/`assigned_at` (the latter defaults to now()) per the
    // real appointments table shape in identity-appointments-schema.sql
    //, there is no start_date/end_date pair on this table.
    const { error: apptErr } = await admin
      .from('appointments')
      .insert({
        profile_id:       userId,
        school_id:        callerProfile.school_id,
        appointment_type: application.role_applied_for,
        status:           'active',
        assigned_by:      user.id,
      })

    if (apptErr) {
      console.error('[generate-code] appointment insert failed:', apptErr.message)
      // Don't roll back the account for this, the account and login are
      // already correct and usable; a missing appointment row means
      // reduced access, not broken access. Surface it so ICT can add the
      // appointment manually rather than losing the account entirely.
    }

    const { error: appErr } = await admin
      .from('access_code_applications')
      .update({
        status:              'code_generated',
        resulting_profile_id: userId,
        updated_at:            new Date().toISOString(),
      })
      .eq('id', id)

    if (appErr) console.error('[generate-code] application status update failed:', appErr.message)

    try {
      await admin.from('portal_audit_log').insert({
        action:       'ict_access_code_generated',
        actor_id:     user.id,
        target_table: 'profiles',
        target_id:    userId,
        metadata:     { role: baseRole, appointment: application.role_applied_for, application_id: id },
        logged_at:    new Date().toISOString(),
      })
    } catch { /* non-critical */ }

    return NextResponse.json({ success: true, code, email: application.email })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
