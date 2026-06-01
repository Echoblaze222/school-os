// src/app/api/super-admin/create-school/route.ts
// Server-side route — uses service role key to safely call auth.admin.createUser()

import { NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  // 1. Verify caller is an authenticated super-admin
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

  // 2. Parse body
  const body = await req.json()
  const {
    schoolName, address, phone, email, primaryColor,
    principalName, principalEmail, principalPhone,
    notes, trialDays, setupType,
    paymentAmount, paymentRef,
  } = body

  if (!schoolName || !principalName || !principalEmail) {
    return NextResponse.json({ ok: false, error: 'Missing required fields' }, { status: 400 })
  }

  // 3. Generate slug — loop until unique to avoid duplicate key errors
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
    if (!clash) break          // slug is free — use it
    slug = `${baseSlug}-${suffix}`
    suffix++
  }

  const now        = new Date()
  const trialEnd   = new Date(now.getTime() + (trialDays ?? 10) * 86400000)
  const freeMonthEnd = new Date(now.getTime() + 30 * 86400000)

  // 4. Create school row
  const { data: school, error: schoolErr } = await adminSupabase
    .from('schools')
    .insert({
      name:              schoolName,
      address,
      phone,
      email,
      primary_color:     primaryColor ?? '#7C3AED',
      slug,
      setup_status:      setupType === 'trial' ? 'trial' : 'active',
      trial_started_at:  setupType === 'trial' ? now.toISOString() : null,
      trial_ends_at:     setupType === 'trial' ? trialEnd.toISOString() : null,
      setup_paid_at:     setupType === 'permanent' ? now.toISOString() : null,
      free_month_starts: setupType === 'permanent' ? now.toISOString() : null,
      free_month_ends:   setupType === 'permanent' ? freeMonthEnd.toISOString() : null,
      subscription_plan: setupType === 'permanent' ? 'free_month' : null,
      created_by_admin:  session.user.id,
      notes,
    })
    .select('id, slug')
    .single()

  if (schoolErr) {
    return NextResponse.json({ ok: false, error: schoolErr.message }, { status: 500 })
  }

  // 5. Create principal auth account (service role — safe server-side)
  const tempPassword = `SchoolOS@${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  const defaultCode  = `PRIN-${school.id.slice(0, 6).toUpperCase()}`

  const { data: authUser, error: authErr } = await adminSupabase.auth.admin.createUser({
    email:         principalEmail,
    password:      tempPassword,
    email_confirm: true,
  })

  if (authErr) {
    // Rollback: delete the school so we don't leave an orphan
    await adminSupabase.from('schools').delete().eq('id', school.id)
    return NextResponse.json({ ok: false, error: `Auth error: ${authErr.message}` }, { status: 500 })
  }

  // 6. Create principal profile
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
    // Rollback both
    await adminSupabase.auth.admin.deleteUser(authUser.user.id)
    await adminSupabase.from('schools').delete().eq('id', school.id)
    return NextResponse.json({ ok: false, error: `Profile error: ${profileErr.message}` }, { status: 500 })
  }

  // 7. Log payment if permanent setup
  if (setupType === 'permanent' && paymentAmount > 0) {
    await adminSupabase.from('school_payments').insert({
      school_id:    school.id,
      payment_type: 'setup',
      amount_ngn:   paymentAmount,
      payment_ref:  paymentRef ?? '',
      confirmed_by: session.user.id,
    })
  }

  // 8. Welcome notification for principal
  const welcomeMsg = setupType === 'trial'
    ? `Your school "${schoolName}" has been set up with a ${trialDays}-day free trial.\n\nLogin: ${principalEmail}\nAccess Code: ${defaultCode}\nTemp Password: ${tempPassword}\n\nPlease change your password after first login.`
    : `Your school "${schoolName}" is now active with 1 month of free access.\n\nLogin: ${principalEmail}\nAccess Code: ${defaultCode}\nTemp Password: ${tempPassword}\n\nPlease change your password after first login.`

  await adminSupabase.from('notifications').insert({
    user_id: authUser.user.id,
    title:   '🎉 Welcome to SchoolOS!',
    body:    welcomeMsg,
    type:    'system',
  })

  return NextResponse.json({
    ok: true,
    school: { id: school.id, slug: school.slug },
    principal: {
      id:           authUser.user.id,
      email:        principalEmail,
      defaultCode,
      tempPassword, // return so super admin can share it if needed
    },
  })
}
