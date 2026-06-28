// app/api/subscription/renew/route.ts
// Called by SubscriptionClient.tsx → handleRenew()
// Initialises a Paystack transaction and returns the payment URL.
// After payment, Paystack redirects to /dashboard/principal/subscription?status=success

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!
const APP_URL         = process.env.NEXT_PUBLIC_APP_URL ?? 'https://school-os-sphg.vercel.app'

export async function POST(req: Request) {
  try {
    const supabase      = await createClient()
    const adminSupabase = createAdminClient()

    // ── Auth: must be a logged-in principal ───────────────────────────────────
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, school_id, full_name, email')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'principal') {
      return NextResponse.json({ error: 'Only principals can renew subscriptions' }, { status: 403 })
    }

    // ── Body ──────────────────────────────────────────────────────────────────
    const { schoolId, planType, studentCount, amount, principalName } = await req.json()

    if (!schoolId || !planType || !amount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (Number(amount) <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
    }

    // ── Get school info for email ─────────────────────────────────────────────
    const { data: school } = await supabase
      .from('schools')
      .select('name, email')
      .eq('id', schoolId)
      .single()

    // ── Generate unique reference ─────────────────────────────────────────────
    const reference = `SCOS-${schoolId.slice(0, 8).toUpperCase()}-${Date.now()}`

    // ── Initialise Paystack transaction ───────────────────────────────────────
    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email:     profile.email ?? school?.email ?? `${schoolId}@schoolos.ng`,
        amount:    Math.round(Number(amount) * 100), // Paystack uses kobo
        reference,
        currency:  'NGN',
        callback_url: `${APP_URL}/api/subscription/callback`,
        metadata: {
          school_id:     schoolId,
          school_name:   school?.name ?? '',
          plan_type:     planType,
          student_count: studentCount,
          principal_id:  user.id,
          principal_name: principalName ?? profile.full_name,
          amount_ngn:    amount,
          custom_fields: [
            { display_name: 'School',   variable_name: 'school_name', value: school?.name ?? '' },
            { display_name: 'Plan',     variable_name: 'plan_type',   value: planType },
            { display_name: 'Students', variable_name: 'student_count', value: String(studentCount) },
          ],
        },
      }),
    })

    const paystackData = await paystackRes.json()

    if (!paystackData.status || !paystackData.data?.authorization_url) {
      console.error('[renew] Paystack error:', paystackData)
      return NextResponse.json(
        { error: paystackData.message ?? 'Failed to initialise payment' },
        { status: 502 }
      )
    }

    // ── Log pending payment in subscription_payments table ────────────────────
    // This lets the super-admin see attempted payments even if webhook is delayed
    await adminSupabase.from('subscription_payments').insert({
      school_id:         schoolId,
      amount_paid:       Number(amount),
      currency_used:     'NGN',
      plan_type:         planType,
      student_count:     studentCount,
      receipt_number:    reference,
      paystack_reference: reference,
      // paid_at will be set by the webhook on confirmation
    }).select().single()
    // Note: ignore insert error — it's just a pre-log, not critical

    return NextResponse.json({
      paymentUrl: paystackData.data.authorization_url,
      reference,
    })

  } catch (err) {
    console.error('[renew] error:', err)
    return NextResponse.json(
      { error: 'Server error. Please try again.' },
      { status: 500 }
    )
  }
            }
      
