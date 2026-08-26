// src/app/api/schools/payment-callback/route.ts
import { NextResponse }      from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { activateSchool }    from '@/lib/activateSchool'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const reference = searchParams.get('reference')

  if (!reference) {
    return NextResponse.redirect(new URL('/register-school/failed', request.url))
  }

  try {
    const supabase = createAdminClient()

    // 1. Verify with Paystack
    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    )
    const verifyData = await verifyRes.json()

    if (!verifyData.status || verifyData.data?.status !== 'success') {
      await supabase
        .from('school_registration_attempts')
        .update({
          status:         'failed',
          failure_reason: verifyData.data?.gateway_response ?? verifyData.message ?? 'Payment verification failed',
          resolved_at:    new Date().toISOString(),
        })
        .eq('reference', reference)
        .eq('status', 'pending')
      return NextResponse.redirect(new URL('/register-school/failed', request.url))
    }

    const schoolId    = verifyData.data?.metadata?.school_id
    const paymentMode = verifyData.data?.metadata?.payment_mode ?? 'full'
    const amountKobo  = verifyData.data?.amount ?? 0

    if (!schoolId) {
      await supabase
        .from('school_registration_attempts')
        .update({
          status:         'failed',
          failure_reason: 'Verified payment was missing school_id in metadata',
          resolved_at:    new Date().toISOString(),
        })
        .eq('reference', reference)
        .eq('status', 'pending')
      return NextResponse.redirect(new URL('/register-school/failed', request.url))
    }

    // 2. Check if already activated (webhook may have fired first)
    const { data: existing } = await supabase
      .from('schools')
      .select('status, is_platform_active')
      .eq('id', schoolId)
      .single()

    if (existing?.status === 'active' && existing?.is_platform_active === true) {
      // Webhook already handled it — skip straight to success
      return NextResponse.redirect(
        new URL(`/register-school/success?school=${schoolId}`, request.url)
      )
    }

    // 3. Activate school + send notification
    const result = await activateSchool(schoolId, paymentMode, amountKobo, reference)
    if (!result.activated) {
      console.warn(`[schools/payment-callback] activation refused: ${result.reason}`)
      await supabase
        .from('school_registration_attempts')
        .update({
          status:         'failed',
          failure_reason: `Activation refused: ${result.reason}`,
          resolved_at:    new Date().toISOString(),
        })
        .eq('reference', reference)
        .eq('status', 'pending')
      return NextResponse.redirect(new URL('/register-school/failed', request.url))
    }

    return NextResponse.redirect(
      new URL(`/register-school/success?school=${schoolId}`, request.url)
    )

  } catch (error) {
    console.error('Payment callback error:', error)
    return NextResponse.redirect(new URL('/register-school/failed', request.url))
  }
}