// src/app/api/subscriptions/renew/route.ts
// Initiates Paystack payment for subscription renewal
// Per-student pricing: students × plan rate

import { NextResponse }      from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const PLAN_RATES: Record<string, number> = {
  Basic:    500,
  Standard: 1000,
  Premium:  2000,
}

export async function POST(request: Request) {
  try {
    const {
      schoolId,
      planType,
      studentCount,
      amount,
      principalName,
      userId,
    } = await request.json()

    if (!schoolId || !planType || !amount) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
    }

    const supabase   = createAdminClient()
    const paystackKey = process.env.PAYSTACK_SECRET_KEY

    // Get school and principal email
    const { data: school } = await supabase
      .from('schools')
      .select('name, email')
      .eq('id', schoolId)
      .single()

    if (!school) {
      return NextResponse.json({ error: 'School not found.' }, { status: 404 })
    }

    const { data: principal } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .single()

    if (!principal) {
      return NextResponse.json({ error: 'Principal not found.' }, { status: 404 })
    }

    // Verify the amount matches expected
    const expectedAmount = studentCount * (PLAN_RATES[planType] ?? 500)
    if (amount !== expectedAmount) {
      return NextResponse.json(
        { error: 'Amount mismatch. Please refresh and try again.' },
        { status: 400 }
      )
    }

    if (!paystackKey) {
      return NextResponse.json(
        { error: 'Payment not configured. Contact SchoolOS support.' },
        { status: 503 }
      )
    }

    // Get current term info
    const now      = new Date()
    const month    = now.getMonth()
    const term     = month < 4 ? 'first' : month < 8 ? 'second' : 'third'
    const year     = now.getFullYear()
    const nextYear = year + 1
    const academicYear = `${year}/${nextYear}`

    // Unique reference
    const reference = `SUB-${schoolId.slice(0, 8).toUpperCase()}-${Date.now()}`

    // Initiate Paystack payment
    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${paystackKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email:        principal.email,
        amount:       amount * 100, // Paystack uses kobo
        currency:     'NGN',
        reference,
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/subscription/callback`,
        metadata: {
          school_id:      schoolId,
          school_name:    school.name,
          plan_type:      planType,
          student_count:  studentCount,
          term,
          academic_year:  academicYear,
          principal_name: principalName,
          reference,
          custom_fields: [
            { display_name: 'School',    variable_name: 'school_name',   value: school.name },
            { display_name: 'Plan',      variable_name: 'plan_type',     value: planType },
            { display_name: 'Students',  variable_name: 'student_count', value: String(studentCount) },
            { display_name: 'Term',      variable_name: 'term',          value: term },
          ],
        },
      }),
    })

    const paystackData = await paystackRes.json()

    if (!paystackData.status || !paystackData.data?.authorization_url) {
      console.error('Paystack error:', paystackData)
      return NextResponse.json(
        { error: 'Failed to initiate payment. Please try again.' },
        { status: 502 }
      )
    }

    return NextResponse.json({
      paymentUrl: paystackData.data.authorization_url,
      reference,
    })

  } catch (error) {
    console.error('Subscription renewal error:', error)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  }
}
