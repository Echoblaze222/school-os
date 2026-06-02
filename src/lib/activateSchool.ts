// src/lib/activateSchool.ts
// Shared helper — called by both payment-callback (GET) and paystack-webhook (POST)
// so activation logic lives in exactly one place.

import { createAdminClient } from '@/lib/supabase/admin'
// ✅ Good — instantiated only when actually called
import { Resend } from 'resend'

let _resend: Resend | null = null

export function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY
    if (!key) throw new Error('RESEND_API_KEY is not set')
    _resend = new Resend(key)
  }
  return _resend
}

export async function activateSchool(schoolId: string, plan: string, amountKobo: number) {
  const supabase = createAdminClient()

  // 1. Pull school + principal info for the notification email
  const { data: school } = await supabase
    .from('schools')
    .select('id, name, email')
    .eq('id', schoolId)
    .single()

  const { data: principal } = await supabase
    .from('profiles')
    .select('full_name, email, default_code')
    .eq('school_id', schoolId)
    .eq('role', 'principal')
    .single()

  // 2. Activate the school
  await supabase
    .from('schools')
    .update({
      status:             'active',
      is_platform_active: true,
      approved_at:        new Date().toISOString(),
      updated_at:         new Date().toISOString(),
    })
    .eq('id', schoolId)

  // 3. Activate the subscription
  await supabase
    .from('subscriptions')
    .update({
      status:     'Active',
      updated_at: new Date().toISOString(),
    })
    .eq('school_registry_id', schoolId)

  // 4. Feature flags based on plan
  const features = ['core_portal', 'fee_management', 'results_system']
  if (plan === 'Premium' || plan === 'Elite') {
    features.push('ai_tutor', 'bulk_sms', 'live_classes', 'whatsapp_notifications')
  }
  if (plan === 'Elite') {
    features.push('ai_face_match', 'custom_domain', 'advanced_analytics')
  }

  await supabase.from('feature_flags').insert(
    features.map(f => ({
      school_id:    schoolId,
      feature_name: f,
      is_enabled:   true,
      enabled_at:   new Date().toISOString(),
    }))
  )

  // 5. Email YOU (super admin) about the new payment
  const amountNaira = (amountKobo / 100).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })
  const now         = new Date().toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })

  await getResend().emails.send({
    from:    'SchoolOS <onboarding@resend.dev>',
    to:      process.env.SUPER_ADMIN_EMAIL!,
    subject: `💰 New School Payment — ${school?.name ?? schoolId}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0f0f0f;color:#fff;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#10B981,#059669);padding:28px;text-align:center;">
          <h1 style="margin:0;font-size:24px;">💰 New Payment Received</h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">${now} (Lagos time)</p>
        </div>
        <div style="padding:28px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="color:#9ca3af;padding:7px 0;font-size:14px;">School</td>
                <td style="color:#fff;font-weight:600;font-size:14px;">${school?.name ?? '—'}</td></tr>
            <tr><td style="color:#9ca3af;padding:7px 0;font-size:14px;">Plan</td>
                <td style="color:#a78bfa;font-weight:600;font-size:14px;">${plan}</td></tr>
            <tr><td style="color:#9ca3af;padding:7px 0;font-size:14px;">Amount</td>
                <td style="color:#10B981;font-weight:700;font-size:18px;">${amountNaira}</td></tr>
            <tr><td style="color:#9ca3af;padding:7px 0;font-size:14px;">Principal</td>
                <td style="color:#fff;font-weight:600;font-size:14px;">${principal?.full_name ?? '—'}</td></tr>
            <tr><td style="color:#9ca3af;padding:7px 0;font-size:14px;">Principal Email</td>
                <td style="color:#fff;font-size:14px;">${principal?.email ?? '—'}</td></tr>
            <tr><td style="color:#9ca3af;padding:7px 0;font-size:14px;">Access Code</td>
                <td style="color:#fff;font-family:monospace;font-size:14px;">${principal?.default_code ?? '—'}</td></tr>
          </table>
          <div style="margin-top:20px;background:#1a2e1a;border:1px solid #10B981;border-radius:8px;padding:12px;text-align:center;">
            <p style="margin:0;color:#10B981;font-size:13px;">✅ School has been automatically activated in SchoolOS</p>
          </div>
        </div>
        <div style="background:#111;padding:14px;text-align:center;">
          <p style="color:#4b5563;font-size:12px;margin:0;">SchoolOS Super Admin Notification</p>
        </div>
      </div>
    `,
  })
}
