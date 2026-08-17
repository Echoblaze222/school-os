// src/app/api/auth/first-login/route.ts
// Handles first-time login for staff/students created via access codes.
// Sets the user's new password and returns their email so the client
// can immediately sign in with signInWithPassword.

import { NextResponse }  from 'next/server'
import { createClient }  from '@supabase/supabase-js'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

export async function POST(request: Request) {
  try {
    const { code, newPassword } = await request.json()

    if (!code || !newPassword) {
      return NextResponse.json(
        { error: 'Access code and new password are required.' },
        { status: 400 }
      )
    }
    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters.' },
        { status: 400 }
      )
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Look up the profile by access code. Trim whitespace defensively —
    // copy-pasted or auto-filled codes can carry leading/trailing spaces
    // that silently fail an exact match.
    const normalizedCode = code.trim().toUpperCase()

    // SECURITY: this endpoint sets a password from nothing but a guessed
    // code — it's the exact endpoint an account-takeover attempt would
    // hammer. Throttle on two dimensions: the caller's IP (catches one
    // attacker guessing across many codes) and the code itself (catches
    // many attackers/requests hammering one target code).
    const ip = getClientIp(request)
    const ipCheck = await checkRateLimit(adminClient, 'auth_first_login_ip', ip, 15, 60)
    if (!ipCheck.allowed) {
      const r = ipCheck.errorResponse!
      return NextResponse.json({ error: r.error }, { status: r.status,
        headers: r.retryAfter ? { 'Retry-After': String(r.retryAfter) } : undefined })
    }
    const codeCheck = await checkRateLimit(adminClient, 'auth_first_login_code', normalizedCode, 8, 300)
    if (!codeCheck.allowed) {
      const r = codeCheck.errorResponse!
      return NextResponse.json({ error: r.error }, { status: r.status,
        headers: r.retryAfter ? { 'Retry-After': String(r.retryAfter) } : undefined })
    }

    const { data: profile, error: profileErr } = await adminClient
      .from('profiles')
      .select('id, email, role, onboarding_stage')
      .eq('default_code', normalizedCode)
      .maybeSingle()

    if (profileErr) {
      console.error('Access code lookup error:', profileErr)
      return NextResponse.json(
        { error: 'Something went wrong looking up that code. Please try again.' },
        { status: 500 }
      )
    }

    if (!profile) {
      return NextResponse.json(
        { error: 'Invalid access code. Please check and try again.' },
        { status: 404 }
      )
    }

    // Only allow this route for accounts that haven't completed onboarding
    const stage = profile.onboarding_stage
    const isFirstLogin = stage === 'start' || stage === 'stage_1_pending'
    if (!isFirstLogin) {
      return NextResponse.json(
        { error: 'Account already activated. Please sign in with your email and password.', already_activated: true, email: profile.email },
        { status: 400 }
      )
    }

    // Update the auth user's password
    const { error: updateErr } = await adminClient.auth.admin.updateUserById(
      profile.id,
      { password: newPassword }
    )

    if (updateErr) {
      console.error('Password update error:', updateErr)
      return NextResponse.json(
        { error: `Failed to update password: ${updateErr.message}` },
        { status: 500 }
      )
    }

    // Advance past the pending-activation stage now that the password is set.
    // onboarding_stage is a string enum ('stage_1_pending' | 'stage_2_pending' |
    // 'stage_3_pending' | 'complete') everywhere else in the app — writing the
    // integer 2 here broke every downstream check that compares against those
    // string values (e.g. the login page's redirect, and stage-gating in
    // middleware), silently routing people to /dashboard instead of onboarding.
    const nextStage = (stage === 'stage_1_pending' || stage === 'start') ? 'stage_2_pending' : stage

    await adminClient
      .from('profiles')
      .update({ onboarding_stage: nextStage })
      .eq('id', profile.id)

    // CRITICAL: return the email so the client can sign in immediately
    return NextResponse.json({
      success:          true,
      email:            profile.email,
      onboarding_stage: nextStage,
      role:             profile.role,
    })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error.'
    console.error('First login error:', msg)
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    )
  }
}
