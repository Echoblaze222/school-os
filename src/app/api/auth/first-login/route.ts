// src/app/api/auth/first-login/route.ts
// Handles first-time login for staff/students created via access codes.
// Uses the service role to retrieve the temp password, then updates it
// to the user's chosen password and advances onboarding_stage.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

    // Admin client — can read temp_password and update auth users
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Look up the profile by access code
    const { data: profile, error: profileErr } = await adminClient
      .from('profiles')
      .select('id, email, role, onboarding_stage')
      .eq('default_code', code.toUpperCase())
      .single()

    if (profileErr || !profile) {
      return NextResponse.json(
        { error: 'Invalid access code.' },
        { status: 404 }
      )
    }

    // Only allow this route for accounts that haven't completed onboarding.
    // Accepts both string stages (canonical) and legacy integer 2 (old data).
    const stage = profile.onboarding_stage
    const isFirstLogin =
      stage === 'stage_1_pending' ||
      stage === 'stage_2_pending' ||
      stage === 'start' ||        // secretary reset value
      stage === 2 ||              // legacy integer from old create-school
      stage === null              // newly created users before stage was set

    if (!isFirstLogin) {
      return NextResponse.json(
        { error: 'Account already activated. Please log in normally.' },
        { status: 400 }
      )
    }

    // Update the auth user's password via admin API (no need to know old password)
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

    // Advance onboarding stage (always use string enum — canonical):
    // principal (stage_1_pending) → stays at stage_1_pending (goes to /onboarding/stage-1)
    // everyone else              → stage_2_pending (goes to /onboarding/stage-2 for PIN setup)
    const nextStage: string =
      stage === 'stage_1_pending' ? 'stage_1_pending' : 'stage_2_pending'

    await adminClient
      .from('profiles')
      .update({ onboarding_stage: nextStage })
      .eq('id', profile.id)

    // ✅ email is included so login page can sign the user in immediately
    return NextResponse.json({
      success:          true,
      email:            profile.email,
      role:             profile.role,
      onboarding_stage: nextStage,
    })

  } catch (e: any) {
    console.error('First login error:', e)
    return NextResponse.json(
      { error: e.message ?? 'Internal server error.' },
      { status: 500 }
    )
  }
}
