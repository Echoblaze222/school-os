// src/app/api/auth/code-signin/route.ts
// Looks up a user's email from their access code so the client
// can call signInWithPassword. Only works for already-activated accounts.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const { code, password } = await request.json()

    if (!code || !password) {
      return NextResponse.json(
        { error: 'Access code and password are required.' },
        { status: 400 }
      )
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: profile, error } = await adminClient
      .from('profiles')
      .select('id, email, onboarding_stage')
      .eq('default_code', code.toUpperCase())
      .single()

    if (error || !profile) {
      return NextResponse.json(
        { error: 'Access code not found. Check and try again.' },
        { status: 404 }
      )
    }

    // Only block truly un-activated accounts (stage = 'start' means password was
    // never set). stage_1_pending means password IS set but onboarding not complete —
    // those users must be able to sign in so they can finish onboarding.
    if (profile.onboarding_stage === 'start') {
      return NextResponse.json(
        { error: 'This is a new account. Use the New User tab to set your password first.' },
        { status: 400 }
      )
    }

    // Return email — client will call signInWithPassword
    return NextResponse.json({ success: true, email: profile.email })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
