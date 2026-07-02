// src/app/api/auth/first-login/route.ts
// Handles first-time login for staff/students created via access codes.
// Sets the user's new password and returns their email so the client
// can immediately sign in with signInWithPassword.

import { NextResponse }  from 'next/server'
import { createClient }  from '@supabase/supabase-js'

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

    // Look up the profile by access code
    const { data: profile, error: profileErr } = await adminClient
      .from('profiles')
      .select('id, email, role, onboarding_stage')
      .eq('default_code', code.toUpperCase())
      .single()

    if (profileErr || !profile) {
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

    // Advance onboarding to stage_2_pending so the client redirects correctly
    const nextStage = 'stage_2_pending'

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
