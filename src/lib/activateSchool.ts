// src/lib/activateSchool.ts
import { createAdminClient } from '@/lib/supabase/admin'
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

  // 1. Pull school + principal info
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
    .eq('school_id', schoolId)

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

  const amountNaira = (amountKobo / 100).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })
  const now         = new Date().toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })
  const loginUrl    = `${process.env.NEXT_PUBLIC_APP_URL}/select-school`

  // 5. Email the PRINCIPAL with their login credentials
  if (principal?.email) {
    await getResend().emails.send({
      from:    'SchoolOS <onboarding@resend.dev>',
      to:      principal.email,
      subject: `🎉 Welcome to SchoolOS — ${school?.name} is Now Active!`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0f0f0f;color:#ffffff;border-radius:12px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#7C3AED,#4F46E5);padding:32px;text-align:center;">
            <h1 style="margin:0;font-size:28px;color:#fff;">Welcome to SchoolOS 🎉</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:15px;">Your school portal is ready</p>
          </div>
          <div style="padding:32px;">
            <p style="color:#d1d5db;font-size:15px;">Hi <strong style="color:#fff;">${principal.full_name}</strong>,</p>
            <p style="color:#d1d5db;font-size:15px;">
              Your payment was successful and <strong style="color:#fff;">${school?.name}</strong> is now 
              <strong style="color:#10B981;">active</strong> on SchoolOS.
            </p>
            <div style="background:#1a1a2e;border:1px solid #7C3AED;border-radius:10px;padding:24px;margin:24px 0;">
              <h3 style="margin:0 0 16px;color:#a78bfa;font-size:14px;text-transform:uppercase;letter-spacing:1px;">Your Login Details</h3>
              <table style="width:100%;border-collapse:collapse;">
                <tr><td style="color:#9ca3af;padding:6px 0;font-size:14px;">School</td>
                    <td style="color:#fff;font-weight:600;font-size:14px;">${school?.name}</td></tr>
                <tr><td style="color:#9ca3af;padding:6px 0;font-size:14px;">Plan</td>
                    <td style="color:#a78bfa;font-weight:600;font-size:14px;">${plan}</td></tr>
                <tr><td style="color:#9ca3af;padding:6px 0;font-size:14px;">Email</td>
                    <td style="color:#fff;font-weight:600;font-size:14px;">${principal.email}</td></tr>
                <tr><td style="color:#9ca3af;padding:6px 0;font-size:14px;">Access Code</td>
                    <td style="color:#fff;font-weight:600;font-family:monospace;font-size:16px;">${principal.default_code}</td></tr>
                <tr><td style="color:#9ca3af;padding:6px 0;font-size:14px;">Amount Paid</td>
                    <td style="color:#10B981;font-weight:700;font-size:14px;">${amountNaira}</td></tr>
              </table>
            </div>
            <p style="color:#f59e0b;font-size:13px;background:#1c1400;border:1px solid #f59e0b;border-radius:8px;padding:12px;">
              ⚠️ Use your email and the password you set during registration to log in. Keep your Access Code safe.
            </p>
            <div style="text-align:center;margin:28px 0;">
              <a href="${loginUrl}" style="background:linear-gradient(135deg,#7C3AED,#4F46E5);color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;display:inline-block;">
                Login to SchoolOS →
              </a>
            </div>
            <p style="color:#6b7280;font-size:13px;text-align:center;">
              Need help? Reply to this email or contact SchoolOS support.
            </p>
          </div>
          <div style="background:#111;padding:16px;text-align:center;">
            <p style="color:#4b5563;font-size:12px;margin:0;">Powered by <strong style="color:#7C3AED;">SchoolOS</strong></p>
          </div>
        </div>
      `,
    })
  }

  // 6. Email YOU (super admin) about the new payment
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
