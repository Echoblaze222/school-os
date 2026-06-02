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
    // 1. Verify with Paystack
    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    )
    const verifyData = await verifyRes.json()

    if (!verifyData.status || verifyData.data?.status !== 'success') {
      return NextResponse.redirect(new URL('/register-school/failed', request.url))
    }

    const schoolId   = verifyData.data?.metadata?.school_id
    const plan       = verifyData.data?.metadata?.plan ?? 'Basic'
    const amountKobo = verifyData.data?.amount ?? 0

    if (!schoolId) {
      return NextResponse.redirect(new URL('/register-school/failed', request.url))
    }

    // 2. Check if already activated (webhook may have fired first)
    const supabase = createAdminClient()
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
    await activateSchool(schoolId, plan, amountKobo)

    return NextResponse.redirect(
      new URL(`/register-school/success?school=${schoolId}`, request.url)
    )

  } catch (error) {
    console.error('Payment callback error:', error)
    return NextResponse.redirect(new URL('/register-school/failed', request.url))
  }
}