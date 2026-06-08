// src/app/api/schools/register/route.ts
// Creates the school, principal account, and initiates Paystack payment

import { NextResponse }      from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const REGISTRATION_FEE = 25000

const PLAN_PRICES: Record<string, number> = {
  Basic:   50000,
  Premium: 120000,
  Elite:   250000,
}

export async function POST(request: Request) {
  try {
    const { school, plan, principal } = await request.json()

    const supabase    = createAdminClient()
    const planPrice   = PLAN_PRICES[plan] ?? 120000
    const totalAmount = REGISTRATION_FEE + planPrice

    // ── 1. Create the school record ──────────────────────
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
        status:             'pending',
        is_platform_active: false,
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
    const defaultCode = `SCH-${Date.now().toString().slice(-6)}`

    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id:               authUser.user.id,
        role:             'principal',
        full_name:        principal.full_name,
        email:            principal.email,
        phone:            principal.phone,
        school_id:        newSchool.id,
        default_code:     defaultCode,
        onboarding_stage: 'stage_1_pending',  // FIX: was integer 2 — now canonical string enum
        is_active:        true,
      })

    if (profileError) {
      console.error('Profile creation error:', profileError)
      await supabase.auth.admin.deleteUser(authUser.user.id)
      await supabase.from('schools').delete().eq('id', newSchool.id)
      return NextResponse.json(
        { error: 'Failed to create principal profile.' },
        { status: 500 }
      )
    }

    // ── 4. Link principal to school ───────────────────────
    await supabase
      .from('schools')
      .update({ principal_id: authUser.user.id })
      .eq('id', newSchool.id)

    // ── 5. Create pending subscription ───────────────────
    const expiryDate = new Date()
    expiryDate.setMonth(expiryDate.getMonth() + 4)

    await supabase.from('subscriptions').insert({
      school_id:     newSchool.id,
      plan_type:     plan,
      status:        'Trial',
      billing_cycle: 'Termly',
      started_at:    new Date().toISOString().split('T')[0],
      expiry_date:   expiryDate.toISOString().split('T')[0],
      amount_paid:   totalAmount,
      currency_used: 'NGN',
    })

    // ── 6. Initiate Paystack payment ──────────────────────
    const paystackKey = process.env.PAYSTACK_SECRET_KEY

    let paymentUrl = null

    if (paystackKey) {
      const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${paystackKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email:        principal.email,
          amount:       totalAmount * 100,
          currency:     'NGN',
          reference:    `SCH-REG-${newSchool.id.slice(0, 8)}-${Date.now()}`,
          callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/schools/payment-callback`,
          metadata: {
            school_id:   newSchool.id,
            plan:        plan,
            school_name: school.name,
            custom_fields: [
              { display_name: 'School Name', variable_name: 'school_name', value: school.name },
              { display_name: 'Plan',        variable_name: 'plan',        value: plan },
            ],
          },
        }),
      })

      const paystackData = await paystackRes.json()
      if (paystackData.status && paystackData.data?.authorization_url) {
        paymentUrl = paystackData.data.authorization_url
      }
    }

    return NextResponse.json({
      success:     true,
      schoolId:    newSchool.id,
      defaultCode: defaultCode,
      paymentUrl:  paymentUrl,
    })

  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: 'Registration failed. Please try again.' },
      { status: 500 }
    )
  }
}
