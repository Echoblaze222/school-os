// src/app/api/auth/first-login/route.ts
// Handles first-time login for staff/students created via access codes.
// Uses the service role to retrieve the temp password, then updates it
// to the user's chosen password and advances onboarding_stage.

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

    // Only allow this route for accounts that haven't completed onboarding
    const stage = profile.onboarding_stage
    const isFirstLogin = stage === 'start' || stage === 'stage_1_pending'
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

    // Advance onboarding stage:
    // principal (stage_1_pending) → stays, will go through stage-1 page
    // staff/student (start) → advance to 2 so they go to PIN setup (stage-2)
    const nextStage = stage === 'stage_1_pending' ? 'stage_1_pending' : 2

    await adminClient
      .from('profiles')
      .update({ onboarding_stage: nextStage })
      .eq('id', profile.id)

    return NextResponse.json({
      success:          true,
      onboarding_stage: nextStage,
      role:             profile.role,
    })

  } catch (e: any) {
    console.error('First login error:', e)
    return NextResponse.json(
      { error: e.message ?? 'Internal server error.' },
      { status: 500 }
    )
  }
        }
  
