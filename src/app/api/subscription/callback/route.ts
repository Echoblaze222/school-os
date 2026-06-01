// src/app/api/subscriptions/callback/route.ts
// Paystack redirects here after subscription payment
// Verifies payment and extends subscription by 4 months

import { NextResponse }      from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const PLAN_FEATURES: Record<string, string[]> = {
  Basic: [
    'core_portal', 'fee_management', 'results_system',
    'assignments', 'timetable', 'attendance',
  ],
  Standard: [
    'core_portal', 'fee_management', 'results_system',
    'assignments', 'timetable', 'attendance',
    'ai_tutor', 'bulk_sms', 'live_classes', 'whatsapp_notifications',
  ],
  Premium: [
    'core_portal', 'fee_management', 'results_system',
    'assignments', 'timetable', 'attendance',
    'ai_tutor', 'bulk_sms', 'live_classes', 'whatsapp_notifications',
    'ai_face_match', 'custom_domain', 'advanced_analytics',
    'cross_school_chat', 'id_cards',
  ],
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const reference = searchParams.get('reference')

  if (!reference) {
    return NextResponse.redirect(
      new URL('/dashboard/principal/subscription?status=failed', request.url)
    )
  }

  try {
    // Verify payment with Paystack
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
        new URL('/dashboard/principal/subscription?status=failed', request.url)
      )
    }

    const meta         = verifyData.data.metadata
    const schoolId     = meta.school_id
    const planType     = meta.plan_type
    const studentCount = meta.student_count
    const term         = meta.term
    const academicYear = meta.academic_year
    const amountPaid   = verifyData.data.amount / 100 // Convert from kobo

    if (!schoolId) {
      return NextResponse.redirect(
        new URL('/dashboard/principal/subscription?status=failed', request.url)
      )
    }

    const supabase = createAdminClient()

    // Calculate new expiry — extend by 4 months from today
    const now    = new Date()
    const expiry = new Date(now)
    expiry.setMonth(expiry.getMonth() + 4)
    const expiryStr = expiry.toISOString().split('T')[0]

    // Update or create subscription
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('school_registry_id', schoolId)
      .single()

    if (existingSub) {
      // Extend existing subscription
      await supabase
        .from('subscriptions')
        .update({
          plan_type:    planType,
          status:       'Active',
          expiry_date:  expiryStr,
          amount_paid:  amountPaid,
          updated_at:   now.toISOString(),
        })
        .eq('school_registry_id', schoolId)
    } else {
      // Create new subscription record
      await supabase
        .from('subscriptions')
        .insert({
          school_registry_id: schoolId,
          plan_type:          planType,
          status:             'Active',
          billing_cycle:      'Termly',
          started_at:         now.toISOString().split('T')[0],
          expiry_date:        expiryStr,
          amount_paid:        amountPaid,
          currency_used:      'NGN',
        })
    }

    // Save payment history
    const receiptNumber = `REN-${Date.now().toString().slice(-8)}`
    await supabase
      .from('subscription_payments')
      .insert({
        school_id:      schoolId,
        amount_paid:    amountPaid,
        currency_used:  'NGN',
        plan_type:      planType,
        student_count:  studentCount,
        term,
        academic_year:  academicYear,
        receipt_number: receiptNumber,
        paystack_reference: reference,
        paid_at:        now.toISOString(),
      })

    // Make sure school is active
    await supabase
      .from('schools')
      .update({
        status:             'active',
        is_platform_active: true,
        updated_at:         now.toISOString(),
      })
      .eq('id', schoolId)

    // Update feature flags based on plan
    const features = PLAN_FEATURES[planType] ?? PLAN_FEATURES.Basic

    // Delete old flags and re-insert based on new plan
    await supabase
      .from('feature_flags')
      .delete()
      .eq('school_id', schoolId)

    await supabase
      .from('feature_flags')
      .insert(
        features.map(f => ({
          school_id:    schoolId,
          feature_name: f,
          is_enabled:   true,
          enabled_at:   now.toISOString(),
        }))
      )

    // Send notification to Principal
    await supabase
      .from('notifications')
      .insert({
        school_id: schoolId,
        type:      'system',
        title:     'Subscription Renewed Successfully',
        body:      `Your ${planType} plan has been renewed until ${expiry.toLocaleDateString('en-NG', { day: '2-digit', month: 'long', year: 'numeric' })}. Thank you!`,
        is_read:   false,
        created_at: now.toISOString(),
      })

    // Redirect to success page
    return NextResponse.redirect(
      new URL(`/dashboard/principal/subscription?status=success&receipt=${receiptNumber}`, request.url)
    )

  } catch (error) {
    console.error('Subscription callback error:', error)
    return NextResponse.redirect(
      new URL('/dashboard/principal/subscription?status=failed', request.url)
    )
  }
}
