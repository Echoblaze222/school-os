// src/app/api/schools/payment-callback/route.ts
// Paystack redirects here after payment is completed.
// We verify the payment and activate the school.

import { NextResponse }      from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const reference = searchParams.get('reference')

  if (!reference) {
    return NextResponse.redirect(
      new URL('/register-school/failed', request.url)
    )
  }

  try {
    // Verify the payment with Paystack
    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    )

    const verifyData = await verifyRes.json()

    if (!verifyData.status || verifyData.data?.status !== 'success') {
      return NextResponse.redirect(
        new URL('/register-school/failed', request.url)
      )
    }

    // Get school ID from metadata
    const schoolId = verifyData.data?.metadata?.school_id
    const plan     = verifyData.data?.metadata?.plan

    if (!schoolId) {
      return NextResponse.redirect(
        new URL('/register-school/failed', request.url)
      )
    }

    const supabase = createAdminClient()

    // Activate the school
    await supabase
      .from('schools')
      .update({
        status:             'active',
        is_platform_active: true,
        approved_at:        new Date().toISOString(),
        updated_at:         new Date().toISOString(),
      })
      .eq('id', schoolId)

    // Activate the subscription
    await supabase
      .from('subscriptions')
      .update({
        status:     'Active',
        updated_at: new Date().toISOString(),
      })
      .eq('school_registry_id', schoolId)

    // Set up default feature flags based on plan
    const features = ['core_portal', 'fee_management', 'results_system']

    if (plan === 'Premium' || plan === 'Elite') {
      features.push('ai_tutor', 'bulk_sms', 'live_classes', 'whatsapp_notifications')
    }

    if (plan === 'Elite') {
      features.push('ai_face_match', 'custom_domain', 'advanced_analytics')
    }

    // Insert feature flags
    await supabase.from('feature_flags').insert(
      features.map(f => ({
        school_id:    schoolId,
        feature_name: f,
        is_enabled:   true,
        enabled_at:   new Date().toISOString(),
      }))
    )

    // Redirect to success page
    return NextResponse.redirect(
      new URL(`/register-school/success?school=${schoolId}`, request.url)
    )

  } catch (error) {
    console.error('Payment callback error:', error)
    return NextResponse.redirect(
      new URL('/register-school/failed', request.url)
    )
  }
}
