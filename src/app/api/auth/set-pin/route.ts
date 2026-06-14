// src/app/api/auth/set-pin/route.ts
//
// Receives the user's 6-digit PIN + secret identifier during onboarding stage 2.
// Hashes the PIN with bcrypt before writing to profiles — the raw PIN never
// touches the database. This is a server route specifically to prevent PIN
// exposure through client-side Supabase calls.
//
// Called by: onboarding/stage-2/page.tsx

import { NextResponse }  from 'next/server'
import { createClient }  from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import bcrypt from 'bcryptjs'

export async function POST(request: Request) {
  try {
    // 1. Authenticate the caller — must be a logged-in user mid-onboarding
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Parse body
    const { pin, secretIdentifier } = await request.json()

    if (!pin || typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN must be exactly 6 digits.' }, { status: 400 })
    }
    if (!secretIdentifier || secretIdentifier.trim().length < 3) {
      return NextResponse.json(
        { error: 'Secret identifier must be at least 3 characters.' },
        { status: 400 }
      )
    }

    // 3. Confirm the user is in the correct onboarding stage
    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('onboarding_stage')
      .eq('id', user.id)
      .single()

    if (!profile || profile.onboarding_stage !== 'stage_2_pending') {
      return NextResponse.json(
        { error: 'Invalid onboarding state for PIN setup.' },
        { status: 400 }
      )
    }

    // 4. Hash the PIN — salt rounds 12 is appropriate for a 6-digit PIN
    //    (high entropy via salt compensates for the small PIN space)
    const pinHash = await bcrypt.hash(pin, 12)

    // 5. Write the hashed PIN — raw PIN never persists anywhere
    const { error: updateErr } = await admin.from('profiles').update({
      pin_hash:          pinHash,
      secret_identifier: secretIdentifier.trim().toLowerCase(),
      onboarding_stage:  'stage_3_pending',
    }).eq('id', user.id)

    if (updateErr) {
      console.error('[set-pin] profile update error:', updateErr)
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })

  } catch (e: any) {
    console.error('[set-pin] unhandled error:', e)
    return NextResponse.json({ error: e.message ?? 'Internal server error' }, { status: 500 })
  }
}
