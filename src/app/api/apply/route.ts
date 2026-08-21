// src/app/api/apply/route.ts
//
// Public, UNAUTHENTICATED endpoint, the self-service access-code
// application form (Phase 2, Lane D). Writes only to
// access_code_applications. Never creates an auth.users row or a
// profiles row here, that only happens later, atomically, when ICT
// clicks Generate Code (see /api/ict/applications/[id]/generate-code).
//
// Because this is public and unauthenticated, it needs the same
// treatment as first-login/code-signin: rate limiting, since it's an
// open POST endpoint that writes to the DB and could otherwise be
// spammed or used to fish for which emails/roles are already pending.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

// Principal and Bursar are admin-issued-only, confirmed default per
// 03-permission-matrix.md's "Open item", both carry financial/full-
// school authority so self-service application is out of scope for them
// regardless of ICT review. If that default is wrong, change this list
// (and the matching one the ICT review UI trusts), don't just relax
// one side of the check.
const EXCLUDED_ROLES = ['principal', 'bursar']

export async function POST(request: Request) {
  try {
    const {
      schoolId, fullName, email, phone,
      roleAppliedFor, roleSpecificFields,
      password,
      verificationMethod,
    } = await request.json()

    if (!schoolId || !fullName || !email || !roleAppliedFor || !password) {
      return NextResponse.json(
        { error: 'School, full name, email, role, and password are required.' },
        { status: 400 },
      )
    }

    if (EXCLUDED_ROLES.includes(roleAppliedFor)) {
      return NextResponse.json(
        { error: 'This role is issued by school administration directly and is not available through self-service application.' },
        { status: 400 },
      )
    }

    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters.' },
        { status: 400 },
      )
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // Throttle by IP (spam/volumetric) and by email (repeated applications
    // for the same address), same two-dimension pattern as auth/first-login.
    const ip = getClientIp(request)
    const ipCheck = await checkRateLimit(admin, 'apply_ip', ip, 10, 3600)
    if (!ipCheck.allowed) {
      const r = ipCheck.errorResponse!
      return NextResponse.json({ error: r.error }, { status: r.status })
    }
    const emailCheck = await checkRateLimit(admin, 'apply_email', email.toLowerCase(), 5, 3600)
    if (!emailCheck.allowed) {
      const r = emailCheck.errorResponse!
      return NextResponse.json({ error: r.error }, { status: r.status })
    }

    // Confirm roleAppliedFor is a real, active appointment type before
    // trusting it, the FK on access_code_applications would catch this
    // too, but a clean 400 here is a better error than a raw DB failure.
    const { data: roleType } = await admin
      .from('appointment_types')
      .select('id, is_active')
      .eq('id', roleAppliedFor)
      .maybeSingle()

    if (!roleType || !roleType.is_active) {
      return NextResponse.json({ error: 'Not a recognized role for application.' }, { status: 400 })
    }

    const { data: school } = await admin
      .from('schools').select('id').eq('id', schoolId).maybeSingle()
    if (!school) {
      return NextResponse.json({ error: 'School not found.' }, { status: 404 })
    }

    // Hashed immediately, never stored or logged in plaintext beyond this
    // request's own memory. Cost 10 matches Supabase Auth's own default
    // (see ict_set_encrypted_password's comment), kept explicit here
    // rather than relying on bcryptjs's library default so a future
    // library upgrade can't silently change it under us.
    const passwordHash = await bcrypt.hash(password, 10)

    const { data: application, error } = await admin
      .from('access_code_applications')
      .insert({
        school_id:            schoolId,
        full_name:            fullName,
        email:                email.toLowerCase(),
        phone:                phone ?? null,
        role_applied_for:     roleAppliedFor,
        role_specific_fields: roleSpecificFields ?? {},
        password_hash:        passwordHash,
        verification_method:  verificationMethod === 'in_person' ? 'in_person' : 'remote',
        status:               'pending',
      })
      .select('id')
      .single()

    if (error) {
      // Duplicate pending application for the same email+school is the
      // one case worth a friendlier message than a raw DB error.
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'An application with this email is already pending review.' },
          { status: 409 },
        )
      }
      console.error('[apply] insert failed:', error.message)
      return NextResponse.json({ error: 'Could not submit application. Please try again.' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      applicationId: application.id,
      message: 'Application submitted. The school\'s ICT team will review it and notify you once your access code is ready.',
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
