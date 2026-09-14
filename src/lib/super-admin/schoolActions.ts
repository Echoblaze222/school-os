// src/lib/super-admin/schoolActions.ts
// Single source of truth for the school mutations that used to live only
// inline in /api/super-admin/manage-school/route.ts. Extracted so the new
// super-admin AI assistant tools (in /api/ai/chat/route.ts) call the exact
// same logic as the existing SchoolCard buttons, instead of a second,
// possibly-drifting copy of the same business rules.
//
// Every function here takes an already-authenticated admin client and the
// acting admin's id - callers are responsible for verifying the caller is
// a real super admin (platform_admins.is_super) before calling any of
// these. Every mutation is audit-logged to portal_audit_log, same as
// before extraction.

export interface ActionResult { ok: boolean; error?: string; [k: string]: unknown }

export async function lockSchool(adminSupabase: any, schoolId: string, actorId: string): Promise<void> {
  const now = new Date().toISOString()
  await adminSupabase.from('schools')
    .update({ setup_status: 'locked', is_platform_active: false, updated_at: now })
    .eq('id', schoolId)
  await adminSupabase.from('portal_audit_log').insert({
    actor_id: actorId, action: 'lock_school', target_table: 'schools', target_id: schoolId,
  })
}

export async function unlockSchool(adminSupabase: any, schoolId: string, actorId: string): Promise<void> {
  const now = new Date().toISOString()
  // See original inline comment (preserved in git history on
  // manage-school/route.ts): giving the school a fresh 30-day window here
  // is deliberate - it re-enters the normal lapse/grace/suspend cycle
  // instead of staying active forever with nothing left to expire it.
  const newSubscriptionEnds = new Date(Date.now() + 30 * 86_400_000).toISOString()

  await adminSupabase.from('schools')
    .update({
      setup_status: 'active', is_platform_active: true,
      subscription_ends: newSubscriptionEnds, updated_at: now,
    })
    .eq('id', schoolId)

  await adminSupabase.from('subscriptions')
    .update({ status: 'Active', updated_at: now })
    .eq('school_id', schoolId).eq('status', 'Expired')

  await adminSupabase.from('portal_audit_log').insert({
    actor_id: actorId, action: 'unlock_school', target_table: 'schools', target_id: schoolId,
    metadata: { new_subscription_ends: newSubscriptionEnds },
  })
}

export async function toggleSchoolLock(adminSupabase: any, schoolId: string, actorId: string): Promise<ActionResult> {
  const { data: school, error: fetchErr } = await adminSupabase
    .from('schools').select('name, setup_status').eq('id', schoolId).single()
  if (fetchErr || !school) return { ok: false, error: 'School not found' }

  const isLocked = school.setup_status === 'locked'
  if (isLocked) {
    await unlockSchool(adminSupabase, schoolId, actorId)
    return { ok: true, setup_status: 'active', school_name: school.name }
  } else {
    await lockSchool(adminSupabase, schoolId, actorId)
    return { ok: true, setup_status: 'locked', school_name: school.name }
  }
}

export async function extendSchoolTrial(adminSupabase: any, schoolId: string, days: number, actorId: string): Promise<ActionResult> {
  if (!days || days < 1) return { ok: false, error: 'Invalid days' }

  const { data: school, error: fetchErr } = await adminSupabase
    .from('schools').select('name, trial_ends_at').eq('id', schoolId).single()
  if (fetchErr || !school) return { ok: false, error: 'School not found' }

  const base = school.trial_ends_at ? new Date(school.trial_ends_at) : new Date()
  const newExpiry = new Date(base.getTime() + days * 86_400_000)

  const { error } = await adminSupabase
    .from('schools')
    .update({
      trial_ends_at: newExpiry.toISOString(), trial_extended: true,
      setup_status: 'trial', is_platform_active: true, updated_at: new Date().toISOString(),
    })
    .eq('id', schoolId)
  if (error) return { ok: false, error: error.message }

  await adminSupabase.from('portal_audit_log').insert({
    actor_id: actorId, action: 'extend_trial', target_table: 'schools', target_id: schoolId,
    metadata: { days, new_expiry: newExpiry.toISOString() },
  })
  return { ok: true, school_name: school.name, new_expiry: newExpiry.toISOString() }
}

export async function confirmSchoolSetupPayment(
  adminSupabase: any, schoolId: string, amountNgn: number, paymentRef: string | undefined, actorId: string
): Promise<ActionResult> {
  const { data: school } = await adminSupabase.from('schools').select('name').eq('id', schoolId).maybeSingle()
  if (!school) return { ok: false, error: 'School not found' }

  const now = new Date()
  const freeEnd = new Date(now.getTime() + 30 * 86_400_000)

  const { error } = await adminSupabase
    .from('schools')
    .update({
      setup_status: 'active', is_platform_active: true, setup_paid_at: now.toISOString(),
      subscription_plan: 'free_month', free_month_starts: now.toISOString(), free_month_ends: freeEnd.toISOString(),
      subscription_starts: now.toISOString(), subscription_ends: freeEnd.toISOString(),
      next_payment_due: freeEnd.toISOString(), updated_at: now.toISOString(),
    })
    .eq('id', schoolId)
  if (error) return { ok: false, error: error.message }

  await adminSupabase.from('subscriptions').upsert({
    school_id: schoolId, plan_type: 'free_month', status: 'Active', billing_cycle: 'Monthly',
    started_at: now.toISOString().split('T')[0], expiry_date: freeEnd.toISOString().split('T')[0],
    amount_paid: amountNgn, currency_used: 'NGN', payment_reference: paymentRef ?? null,
  }, { onConflict: 'school_id' })

  if (amountNgn > 0) {
    await adminSupabase.from('school_payments').insert({
      school_id: schoolId, payment_type: 'setup', amount_ngn: amountNgn,
      payment_ref: paymentRef ?? null, confirmed_by: actorId, confirmed_at: now.toISOString(),
    })
  }

  await adminSupabase.from('portal_audit_log').insert({
    actor_id: actorId, action: 'confirm_setup', target_table: 'schools', target_id: schoolId,
    metadata: { amount_ngn: amountNgn, payment_ref: paymentRef },
  })
  return { ok: true, school_name: school.name }
}

export async function confirmSchoolSubscriptionPayment(
  adminSupabase: any, schoolId: string, plan: string, amountNgn: number, paymentRef: string | undefined, actorId: string
): Promise<ActionResult> {
  const { data: school } = await adminSupabase.from('schools').select('name').eq('id', schoolId).maybeSingle()
  if (!school) return { ok: false, error: 'School not found' }

  const now = new Date()
  const cycleMonths: Record<string, number> = {
    basic_500: 1, standard_1000: 1, premium_2000: 1, installment_3month: 3,
  }
  const months = cycleMonths[plan] ?? 1
  const subEnd = new Date(now.getTime() + months * 30 * 86_400_000)

  const { error } = await adminSupabase
    .from('schools')
    .update({
      setup_status: 'active', is_platform_active: true, subscription_plan: plan,
      subscription_starts: now.toISOString(), subscription_ends: subEnd.toISOString(),
      next_payment_due: subEnd.toISOString(), updated_at: now.toISOString(),
    })
    .eq('id', schoolId)
  if (error) return { ok: false, error: error.message }

  await adminSupabase.from('subscriptions').upsert({
    school_id: schoolId, plan_type: plan, status: 'Active', billing_cycle: 'Termly',
    started_at: now.toISOString().split('T')[0], expiry_date: subEnd.toISOString().split('T')[0],
    amount_paid: amountNgn, currency_used: 'NGN', payment_reference: paymentRef ?? null,
  }, { onConflict: 'school_id' })

  if (amountNgn > 0) {
    await adminSupabase.from('school_payments').insert({
      school_id: schoolId, payment_type: 'subscription', plan, amount_ngn: amountNgn,
      payment_ref: paymentRef ?? null, confirmed_by: actorId, confirmed_at: now.toISOString(),
    })
  }

  await adminSupabase.from('portal_audit_log').insert({
    actor_id: actorId, action: 'confirm_subscription', target_table: 'schools', target_id: schoolId,
    metadata: { plan, amount_ngn: amountNgn, payment_ref: paymentRef },
  })
  return { ok: true, school_name: school.name }
}

// Fuzzy-ish name lookup for the AI tools, which get a school NAME from the
// admin's chat message, not an id. Exact match first, then case-insensitive
// substring. Returns null for zero or multiple matches - callers should
// treat both as "ask the admin to be more specific" rather than guessing.
export async function findSchoolByName(adminSupabase: any, name: string): Promise<{ id: string; name: string } | null> {
  const { data: exact } = await adminSupabase
    .from('schools').select('id, name').ilike('name', name).limit(2)
  if (exact?.length === 1) return exact[0]

  const { data: partial } = await adminSupabase
    .from('schools').select('id, name').ilike('name', `%${name}%`).limit(2)
  if (partial?.length === 1) return partial[0]

  return null
}
