// src/app/api/auth/self-register/route.ts
// Public platform (Phase 4, Lane C) - §58: a visitor should be able to
// create a SchoolOS identity on their own, with no admin-issued access
// code, in order to send an admission request.
//
// This is a SEPARATE pathway from /api/auth/first-login and
// /api/auth/code-signin. Those remain the only way to become a tenant
// member (student/teacher/staff at a specific school) - this route only
// ever produces an identity with school_id = null and
// onboarding_stage = 'complete', which /dashboard/page.tsx routes to
// /dashboard/applications, not any role dashboard.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ALLOWED_ROLES = ['parent', 'student'] as const

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body?.password === 'string' ? body.password : ''
    const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : ''
    const role = ALLOWED_ROLES.includes(body?.role) ? body.role : 'parent'

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
    }
    if (!fullName || fullName.length < 2) {
      return NextResponse.json({ error: 'Enter your full name.' }, { status: 400 })
    }
    if (fullName.length > 200) {
      return NextResponse.json({ error: 'That name is too long.' }, { status: 400 })
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // SECURITY: this is an unauthenticated, publicly reachable endpoint
    // that creates real auth users - the obvious abuse vector is scripted
    // mass account creation (spam, fraud farms feeding the admission
    // system, credential-stuffing infrastructure). Throttle by IP and by
    // the target email, same two-dimension pattern as first-login.
    const ip = getClientIp(request)
    const ipCheck = await checkRateLimit(adminClient, 'self_register_ip', ip, 8, 3600)
    if (!ipCheck.allowed) {
      const r = ipCheck.errorResponse!
      return NextResponse.json({ error: r.error }, { status: r.status,
        headers: r.retryAfter ? { 'Retry-After': String(r.retryAfter) } : undefined })
    }
    const emailCheck = await checkRateLimit(adminClient, 'self_register_email', email, 3, 3600)
    if (!emailCheck.allowed) {
      const r = emailCheck.errorResponse!
      return NextResponse.json({ error: r.error }, { status: r.status,
        headers: r.retryAfter ? { 'Retry-After': String(r.retryAfter) } : undefined })
    }

    // Reuse an existing SchoolOS identity rather than creating a
    // duplicate account, per §58. If this email already has a profile
    // (staff/student/parent onboarded by a school, or a prior applicant
    // signup), tell them to sign in instead - never silently merge or
    // silently create a second account for the same email.
    const { data: existing } = await adminClient
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Sign in instead.' },
        { status: 409 }
      )
    }

    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // no school-issued invite to confirm identity via; verify by normal means post-signup if required
    })

    if (createErr || !created?.user) {
      console.error('self-register: createUser failed:', createErr?.message)
      // Do not leak whether the email exists via auth.users specifically -
      // the profiles check above already gives the precise, correct
      // message for that case. A createUser failure here is treated as a
      // generic failure so it can't be used to enumerate accounts that
      // exist in auth.users but not yet in profiles.
      return NextResponse.json({ error: 'Could not create your account. Please try again.' }, { status: 500 })
    }

    const { error: profileErr } = await adminClient.from('profiles').insert({
      id: created.user.id,
      role,
      full_name: fullName,
      email,
      school_id: null,                 // global identity only - not a tenant member of any school
      onboarding_stage: 'complete',    // skips the access-code-issued onboarding flow entirely
      is_active: true,
    })

    if (profileErr) {
      console.error('self-register: profile insert failed:', profileErr.message)
      // Roll back the auth user so we don't leave an orphaned auth
      // account with no profile - that would silently break this same
      // person's next signup attempt (createUser would then fail on a
      // duplicate email with no way to recover without support).
      await adminClient.auth.admin.deleteUser(created.user.id)
      return NextResponse.json({ error: 'Could not create your account. Please try again.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, email })
  } catch (err) {
    console.error('self-register: unexpected error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
