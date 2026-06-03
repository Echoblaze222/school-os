// src/app/api/super-admin/create-school/route.ts
import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getResend }         from '@/lib/activateSchool'

export async function POST(req: Request) {
  const supabase      = await createClient()
  const adminSupabase = createAdminClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })
  }

  const { data: sa } = await adminSupabase
    .from('super_admins')
    .select('id')
    .eq('id', session.user.id)
    .single()

  if (!sa) {
    return NextResponse.json({ ok: false, error: 'Not a super admin' }, { status: 403 })
  }

  const body = await req.json()
  const {
    schoolName, address, phone, email, primaryColor,
    principalName, principalEmail, principalPhone,
    notes, trialDays, setupType,
    paymentAmount, paymentRef,
    city, state, schoolType, logoUrl, tagline,
  } = body

  if (!schoolName || !principalName || !principalEmail) {
    return NextResponse.json({ ok: false, error: 'Missing required fields' }, { status: 400 })
  }

  const baseSlug = schoolName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  let slug   = baseSlug
  let suffix = 1
  while (true) {
    const { data: clash } = await adminSupabase
      .from('schools')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()
    if (!clash) break
    slug = `${baseSlug}-${suffix}`
    suffix++
  }

  const now          = new Date()
  const trialEnd     = new Date(now.getTime() + (trialDays ?? 10) * 86400000)
  const freeMonthEnd = new Date(now.getTime() + 30 * 86400000)

  const { data: school, error: schoolErr } = await adminSupabase
    .from('schools')
    .insert({
      name:               schoolName,
      address,
      phone,
      email,
      city:               city ?? null,
      state:              state ?? null,
      school_type:        schoolType ?? 'private',
      logo_url:           logoUrl ?? null,
      tagline:            tagline ?? null,
      is_platform_active: true,
      primary_color:      primaryColor ?? '#7C3AED',
      slug,
      setup_status:       setupType === 'trial' ? 'trial' : 'active',
      trial_started_at:   setupType === 'trial' ? now.toISOString() : null,
      trial_ends_at:      setupType === 'trial' ? trialEnd.toISOString() : null,
      setup_paid_at:      setupType === 'permanent' ? now.toISOString() : null,
      free_month_starts:  setupType === 'permanent' ? now.toISOString() : null,
      free_month_ends:    setupType === 'permanent' ? freeMonthEnd.toISOString() : null,
      subscription_plan:  setupType === 'permanent' ? 'free_month' : null,
      created_by_admin:   session.user.id,
      notes,
    })
    .select('id, slug')
    .single()

  if (schoolErr) {
    return NextResponse.json({ ok: false, error: schoolErr.message }, { status: 500 })
  }

  const tempPassword = `SchoolOS@${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  const defaultCode  = `PRIN-${school.id.slice(0, 6).toUpperCase()}`

  const { data: authUser, error: authErr } = await adminSupabase.auth.admin.createUser({
    email:         principalEmail,
    password:      tempPassword,
    email_confirm: true,
  })

  if (authErr) {
    await adminSupabase.from('schools').delete().eq('id', school.id)
    return NextResponse.json({ ok: false, error: `Auth error: ${authErr.message}` }, { status: 500 })
  }

  const { error: profileErr } = await adminSupabase.from('profiles').insert({
    id:               authUser.user.id,
    full_name:        principalName,
    email:            principalEmail,
    phone:            principalPhone,
    role:             'principal',
    school_id:        school.id,
    default_code:     defaultCode,
    onboarding_stage: 2,
  })

  if (profileErr) {
    await adminSupabase.auth.admin.deleteUser(authUser.user.id)
    await adminSupabase.from('schools').delete().eq('id', school.id)
    return NextResponse.json({ ok: false, error: `Profile error: ${profileErr.message}` }, { status: 500 })
  }

  if (setupType === 'permanent' && paymentAmount > 0) {
    await adminSupabase.from('school_payments').insert({
      school_id:    school.id,
      payment_type: 'setup',
      amount_ngn:   paymentAmount,
      payment_ref:  paymentRef ?? '',
      confirmed_by: session.user.id,
    })
  }

  const welcomeMsg = setupType === 'trial'
    ? `Your school "${schoolName}" has been set up with a ${trialDays}-day free trial.\n\nLogin: ${principalEmail}\nAccess Code: ${defaultCode}\nTemp Password: ${tempPassword}\n\nPlease change your password after first login.`
    : `Your school "${schoolName}" is now active with 1 month of free access.\n\nLogin: ${principalEmail}\nAccess Code: ${defaultCode}\nTemp Password: ${tempPassword}\n\nPlease change your password after first login.`

  await adminSupabase.from('notifications').insert({
    user_id: authUser.user.id,
    title:   '🎉 Welcome to SchoolOS!',
    body:    welcomeMsg,
    type:    'system',
  })

  const loginUrl  = `${process.env.NEXT_PUBLIC_APP_URL}/select-school`
  const planLabel = setupType === 'trial' ? `${trialDays}-Day Free Trial` : 'Active (1 Month Free)'

  await getResend().emails.send({
    from:    'SchoolOS <onboarding@resend.dev>',
    to:      principalEmail,
    subject: `🎉 Welcome to SchoolOS — Your School is Ready`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0f0f0f;color:#ffffff;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#7C3AED,#4F46E5);padding:32px;text-align:center;">
          <h1 style="margin:0;font-size:28px;color:#fff;">Welcome to SchoolOS</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:15px;">Your school has been successfully set up</p>
        </div>
        <div style="padding:32px;">
          <p style="color:#d1d5db;font-size:15px;">Hi <strong style="color:#fff;">${principalName}</strong>,</p>
          <p style="color:#d1d5db;font-size:15px;">
            ${setupType === 'trial'
              ? `Your school <strong style="color:#fff;">${schoolName}</strong> has been set up with a <strong style="color:#a78bfa;">${trialDays}-day free trial</strong>.`
              : `Your school <strong style="color:#fff;">${schoolName}</strong> is now <strong style="color:#a78bfa;">active</strong> with 1 month of free access.`
            }
          </p>
          <div style="background:#1a1a2e;border:1px solid #7C3AED;border-radius:10px;padding:24px;margin:24px 0;">
            <h3 style="margin:0 0 16px;color:#a78bfa;font-size:14px;text-transform:uppercase;letter-spacing:1px;">Your Login Credentials</h3>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="color:#9ca3af;padding:6px 0;font-size:14px;">School</td><td style="color:#fff;font-weight:600;font-size:14px;">${schoolName}</td></tr>
              <tr><td style="color:#9ca3af;padding:6px 0;font-size:14px;">Plan</td><td style="color:#a78bfa;font-weight:600;font-size:14px;">${planLabel}</td></tr>
              <tr><td style="color:#9ca3af;padding:6px 0;font-size:14px;">Email</td><td style="color:#fff;font-weight:600;font-size:14px;">${principalEmail}</td></tr>
              <tr><td style="color:#9ca3af;padding:6px 0;font-size:14px;">Access Code</td><td style="color:#fff;font-weight:600;font-size:14px;font-family:monospace;">${defaultCode}</td></tr>
              <tr><td style="color:#9ca3af;padding:6px 0;font-size:14px;">Temp Password</td><td style="color:#fff;font-weight:600;font-size:14px;font-family:monospace;">${tempPassword}</td></tr>
            </table>
          </div>
          <p style="color:#f59e0b;font-size:13px;background:#1c1400;border:1px solid #f59e0b;border-radius:8px;padding:12px;">
            ⚠️ You will be asked to set a new PIN and password on first login. Keep this email safe until then.
          </p>
          <div style="text-align:center;margin:28px 0;">
            <a href="${loginUrl}" style="background:linear-gradient(135deg,#7C3AED,#4F46E5);color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;display:inline-block;">
              Login to SchoolOS →
            </a>
          </div>
          <p style="color:#6b7280;font-size:13px;text-align:center;margin-top:24px;">
            Need help? Reply to this email or contact SchoolOS support.
          </p>
        </div>
        <div style="background:#111;padding:16px;text-align:center;">
          <p style="color:#4b5563;font-size:12px;margin:0;">Powered by <strong style="color:#7C3AED;">SchoolOS</strong> — Built for Nigerian Schools</p>
        </div>
      </div>
    `,
  })

  return NextResponse.json({
    ok: true,
    school:    { id: school.id, slug: school.slug },
    principal: { id: authUser.user.id, email: principalEmail, defaultCode, tempPassword },
  })
}
