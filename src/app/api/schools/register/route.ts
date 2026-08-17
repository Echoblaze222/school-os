// src/app/api/schools/register/route.ts

// Creates the school, principal account, and initiates Paystack payment



import { NextResponse }      from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'

import crypto                 from 'crypto'



// One-time platform setup fee

const REGISTRATION_FEE             = 150000  // ₦150,000 full upfront

const REGISTRATION_FEE_INSTALLMENT = 50000   // ₦50,000 × 3 months



export async function POST(request: Request) {

  try {

    const { school, principal, paymentMode } = await request.json()

    // paymentMode: 'full' | 'installment'

    // Subscription billing is per-student-per-term (handled separately after onboarding)



    const supabase    = createAdminClient()

    // Amount due now depends on chosen payment mode

    const amountDue   = paymentMode === 'installment'

      ? REGISTRATION_FEE_INSTALLMENT  // first instalment ₦50,000

      : REGISTRATION_FEE              // full payment ₦150,000



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



    // Seed the default subject list so this school isn't left with an

    // empty curriculum — without this, subjects, class-subject

    // assignments, live classes, notes, and results all silently fail

    // until someone manually adds subjects one by one.

    const { error: seedError } = await supabase.rpc('seed_default_subjects', {

      target_school_id: newSchool.id,

    })

    if (seedError) {

      console.error('Subject seeding error (non-fatal):', seedError)

      // Don't fail registration over this — the school can still add

      // subjects manually if seeding didn't work for some reason.

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

    // SECURITY FIX: this used to be `SCH-${Date.now().toString().slice(-6)}`
    // — the last 6 digits of the server clock, which repeats on a ~16.7
    // minute cycle and is trivially guessable by anyone with a rough idea
    // of when the school registered. That code is the sole credential
    // /api/auth/first-login accepts to set the principal's password, so a
    // predictable code there is a direct account-takeover path. Generate
    // it the same cryptographically random way admin/create-user and
    // staff-codes/regenerate already do.
    const defaultCode = `SCH-${crypto.randomBytes(6).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)}`



    // The DB trigger handle_new_user may have already created a blank profile row

    // on auth user creation. Use upsert (INSERT ... ON CONFLICT DO UPDATE) so we

    // don't get a duplicate-key error regardless of trigger timing.

    const { error: profileError } = await supabase

      .from('profiles')

      .upsert({

        id:               authUser.user.id,

        role:             'principal',

        full_name:        principal.full_name,

        email:            principal.email,

        phone:            principal.phone,

        school_id:        newSchool.id,

        default_code:     defaultCode,

        onboarding_stage: 'stage_1_pending',

        is_active:        true,

      }, { onConflict: 'id' })



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



    // ── 5. Create pending subscription (Trial until paid) ─

    const expiryDate = new Date()

    expiryDate.setMonth(expiryDate.getMonth() + 4)



    await supabase.from('subscriptions').insert({

      school_id:     newSchool.id,

      plan_type:     'Basic',           // default; principal upgrades after onboarding

      status:        'Trial',

      billing_cycle: 'Termly',

      started_at:    new Date().toISOString().split('T')[0],

      expiry_date:   expiryDate.toISOString().split('T')[0],

      amount_paid:   0,

      currency_used: 'NGN',

      notes:         `Setup fee: ${paymentMode === 'installment' ? '3-month installment' : 'full payment'}`,

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

          amount:       amountDue * 100,  // kobo

          currency:     'NGN',

          reference:    `SCH-REG-${newSchool.id.slice(0, 8)}-${Date.now()}`,

          callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/schools/payment-callback`,

          metadata: {

            school_id:    newSchool.id,

            payment_mode: paymentMode,  // 'full' | 'installment'

            school_name:  school.name,

            custom_fields: [

              { display_name: 'School Name',    variable_name: 'school_name',   value: school.name },

              { display_name: 'Payment Mode',   variable_name: 'payment_mode',  value: paymentMode },

              { display_name: 'Amount',         variable_name: 'amount',        value: `₦${amountDue.toLocaleString()}` },

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

         
