// src/app/api/auth/verify-nin/route.ts
//
// Verifies a Nigerian NIN in real-time via Dojah.
// The Dojah API key lives only on the server — never exposed to the client.
//
// Dojah docs: https://docs.dojah.io/docs/nin-lookup
// Add to .env.local:
//   DOJAH_APP_ID=your_app_id
//   DOJAH_API_KEY=your_private_key
//
// Free tier: 100 NIN lookups/month. Production: pay-as-you-go.
// Sign up at https://dojah.io — API keys available in ~5 minutes.

import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const DOJAH_BASE = 'https://api.dojah.io'

export async function POST(request: Request) {
  try {
    // ── 1. Auth — must be a logged-in user in stage_3_pending ──────────────
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── 2. Parse body ────────────────────────────────────────────────────────
    const { nin } = await request.json()

    if (!nin || typeof nin !== 'string' || !/^\d{11}$/.test(nin)) {
      return NextResponse.json(
        { error: 'NIN must be exactly 11 digits.' },
        { status: 400 }
      )
    }

    // ── 3. Confirm correct onboarding stage ──────────────────────────────────
    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('onboarding_stage, full_name')
      .eq('id', user.id)
      .single()

    if (!profile || profile.onboarding_stage !== 'stage_3_pending') {
      return NextResponse.json(
        { error: 'Invalid onboarding state for NIN verification.' },
        { status: 400 }
      )
    }

    // ── 4. Check env vars ────────────────────────────────────────────────────
    const appId  = process.env.DOJAH_APP_ID
    const apiKey = process.env.DOJAH_API_KEY

    if (!appId || !apiKey) {
      console.error('[verify-nin] DOJAH_APP_ID or DOJAH_API_KEY not set')
      return NextResponse.json(
        { error: 'Identity verification is not configured. Contact support.' },
        { status: 503 }
      )
    }

    // ── 5. Call Dojah NIN lookup ─────────────────────────────────────────────
    const dojahRes = await fetch(
      `${DOJAH_BASE}/api/v1/kyc/nin?nin=${nin}`,
      {
        method:  'GET',
        headers: {
          'AppId':        appId,
          'Authorization': apiKey,
          'Accept':       'application/json',
        },
      }
    )

    const dojahData = await dojahRes.json()

    // ── 6. Handle Dojah errors ───────────────────────────────────────────────
    if (!dojahRes.ok) {
      // Dojah returns 404 when the NIN is not found in NIMC's database
      if (dojahRes.status === 404) {
        return NextResponse.json(
          { error: 'NIN not found. Please check the number and try again.' },
          { status: 422 }
        )
      }
      // Log status + message only — never log dojahData directly as it may echo the NIN
      console.error('[verify-nin] Dojah error:', dojahRes.status, dojahData?.error ?? dojahData?.message ?? 'unknown')
      return NextResponse.json(
        { error: 'Verification service error. Please try again.' },
        { status: 502 }
      )
    }

    const ninData = dojahData?.entity

    if (!ninData) {
      return NextResponse.json(
        { error: 'No data returned for this NIN. Please try again.' },
        { status: 422 }
      )
    }

    // ── 7. Log the verification attempt ─────────────────────────────────────
    // nin_verification_log exists in the schema — write to it regardless of outcome
    await admin.from('nin_verification_log').insert({
      user_id:           user.id,
      passport_url:      '',            // photo URL added after upload in stage-3
      nin_url:           nin,           // storing NIN string in this column
      match_confidence:  100,           // Dojah NIN lookup is binary — either found or not
      passed:            true,
      verified_at:       new Date().toISOString(),
    }).then(() => { /* fire and forget */ })

    // ── 8. Return the verified identity data to the client ──────────────────
    // The client will display this for the user to confirm before saving.
    return NextResponse.json({
      ok:       true,
      verified: true,
      identity: {
        firstName:   ninData.first_name  ?? '',
        lastName:    ninData.last_name   ?? '',
        middleName:  ninData.middle_name ?? '',
        dateOfBirth: ninData.birthdate   ?? '',
        gender:      ninData.gender      ?? '',
        phone:       ninData.phone       ?? '',
        photo:       ninData.photo       ?? null,   // base64 photo from NIMC if available
      },
    })

  } catch (e: any) {
    console.error('[verify-nin] unhandled error:', e)
    return NextResponse.json(
      { error: e.message ?? 'Internal server error' },
      { status: 500 }
    )
  }
}
