// src/app/api/schools/register/route.ts
//
// Creates the school and principal account. Registration is FREE: the school
// is activated immediately, no setup fee and no Paystack redirect.
// (Recurring per-student billing is handled separately after onboarding.)

import { NextResponse }      from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import crypto                 from 'crypto'

// Every school gets the full feature set (same list activateSchool.ts used).
const ALL_FEATURES = [
  'core_portal', 'fee_management', 'results_system', 'ai_tutor',
  'bulk_sms', 'live_classes', 'whatsapp_notifications',
  'ai_face_match', 'custom_domain', 'advanced_analytics',
]

export async function POST(request: Request) {
  try {
    const { school, principal } = await request.json()

    // Server-side enforcement, not just the client-side checkbox - a
    // direct API call could otherwise skip the UI entirely.
    if (!principal?.agreedToTerms) {
      return NextResponse.json({ error: 'You must agree to the Terms & Conditions and Privacy Policy to register a school.' }, { status: 400 })
    }
    if (!school?.name?.trim() || !principal?.email || !principal?.password) {
      return NextResponse.json({ error: 'School name, principal email and password are required.' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Service period starts now, same 4-month cadence the paid flow used,
    // so the existing expiry/locking system (middleware + check-subscriptions
    // cron) keeps working for free-registered schools.
    const now = new Date()
    const subscriptionEnds = new Date(now)
    subscriptionEnds.setMonth(subscriptionEnds.getMonth() + 4)

    // ── 1. Create the school record (already active) ─────
    const slug = school.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    const { data: newSchool, error: schoolError } = await supabase
      .from('schools')
      .insert({
        name:               school.name,
        slug:               `${slug}-${Date.now()}`,
        school_type:        school.school_type,
        address:            school.address,
        city:               school.city,
        state:              school.state,
        country:            'Nigeria',
        phone:              school.phone,
        email:              school.email,
        tagline:            school.tagline,
        primary_color:      school.primary_color,
        font_family:        school.font_family,
        status:             'active',
        setup_status:       'active',
        subscription_ends:  subscriptionEnds.toISOString(),
        is_platform_active: true,
      })
      .select()
      .single()

    if (schoolError || !newSchool) {
      console.error('School creation error:', schoolError)
      return NextResponse.json(
        { error: schoolError?.message ?? 'Failed to create school. Please try again.' },
        { status: 500 }
      )
    }

    // Seed the default subject list so the school isn't left with an empty curriculum.
    const { error: seedError } = await supabase.rpc('seed_default_subjects', {
      target_school_id: newSchool.id,
    })
    if (seedError) {
      console.error('Subject seeding error (non-fatal):', seedError)
    }

    // ── 2. Create principal auth account ─────────────────
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email:         principal.email,
      password:      principal.password,
      email_confirm: true,
    })

    if (authError || !authUser.user) {
      await supabase.from('schools').delete().eq('id', newSchool.id)
      return NextResponse.json(
        { error: authError?.message ?? 'Failed to create principal account.' },
        { status: 500 }
      )
    }

    // ── 3. Create principal profile ───────────────────────
    // Cryptographically random access code (the previous clock-based one was
    // guessable - see the original security fix).
    const defaultCode = `SCH-${crypto.randomBytes(6).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)}`

    // handle_new_user trigger may have created a blank profile; delete it so
    // this is a plain INSERT (an upsert would trip the role-change guard trigger).
    await supabase.from('profiles').delete().eq('id', authUser.user.id)

    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id:                authUser.user.id,
        role:              'principal',
        full_name:         principal.full_name,
        email:             principal.email,
        phone:             principal.phone,
        school_id:         newSchool.id,
        default_code:      defaultCode,
        onboarding_stage:  'stage_1_pending',
        is_active:         true,
        terms_accepted_at: now.toISOString(),
      })

    if (profileError) {
      console.error('Profile creation error:', {
        message: profileError.message,
        code:    profileError.code,
        details: profileError.details,
        hint:    profileError.hint,
      })
      await supabase.auth.admin.deleteUser(authUser.user.id)
      await supabase.from('schools').delete().eq('id', newSchool.id)
      return NextResponse.json(
        { error: profileError?.message ?? 'Failed to create principal profile.' },
        { status: 500 }
      )
    }

    // ── 4. Link principal to school ───────────────────────
    await supabase
      .from('schools')
      .update({ principal_id: authUser.user.id })
      .eq('id', newSchool.id)

    // ── 5. Active subscription (free registration) ───────
    await supabase.from('subscriptions').insert({
      school_id:     newSchool.id,
      plan_type:     'Basic',
      status:        'Active',
      billing_cycle: 'Termly',
      started_at:    now.toISOString().split('T')[0],
      expiry_date:   subscriptionEnds.toISOString().split('T')[0],
      amount_paid:   0,
      currency_used: 'NGN',
      notes:         'Free registration (no setup fee)',
    })

    // ── 6. Full feature set for every school ─────────────
    const { error: flagError } = await supabase.from('feature_flags').insert(
      ALL_FEATURES.map(f => ({
        school_id:    newSchool.id,
        feature_name: f,
        is_enabled:   true,
        enabled_at:   now.toISOString(),
      }))
    )
    if (flagError) console.error('Feature flag insert error (non-fatal):', flagError.message)

    return NextResponse.json({
      success:     true,
      schoolId:    newSchool.id,
      schoolName:  newSchool.name,
      defaultCode: defaultCode,
    })

  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: 'Registration failed. Please try again.' },
      { status: 500 }
    )
  }
}
