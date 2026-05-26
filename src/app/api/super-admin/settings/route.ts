// app/api/super-admin/settings/route.ts
//
// ALL writes to trial_config, subscription_plans, setup_fee_config, and
// installment_config go through here — never from the browser anon client.
//
// Guard: session must exist AND user must be in the super_admins table.
// Writes use the service-role admin client so RLS is bypassed safely on the
// server, not exposed to the browser.

import { NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Auth helper ──────────────────────────────────────────────────────────────

async function verifySuperAdmin() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const admin = createAdminClient()
  const { data: sa } = await admin
    .from('super_admins')
    .select('id')
    .eq('id', session.user.id)
    .single()

  if (!sa) return null
  return admin
}

// ── GET — load all four config tables ────────────────────────────────────────

export async function GET() {
  const admin = await verifySuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [
    { data: plans,       error: e1 },
    { data: trial,       error: e2 },
    { data: installment, error: e3 },
    { data: setupFee,    error: e4 },
  ] = await Promise.all([
    admin.from('subscription_plans').select('*').order('sort_order'),
    admin.from('trial_config').select('*').single(),
    admin.from('installment_config').select('*').single(),
    admin.from('setup_fee_config').select('*').maybeSingle(),
  ])

  const err = e1 ?? e2 ?? e3 ?? e4
  if (err) {
    console.error('[super-admin/settings GET]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  return NextResponse.json({ plans, trial, installment, setupFee })
}

// ── POST — dispatch by action ─────────────────────────────────────────────────

export async function POST(req: Request) {
  const admin = await verifySuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { action, payload } = await req.json()

  switch (action) {

    // ── Trial config ─────────────────────────────────────────────────────────
    case 'saveTrial': {
      const { id, default_days, grace_hours } = payload
      const { error } = await admin
        .from('trial_config')
        .update({ default_days, grace_hours, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // ── Installment config ───────────────────────────────────────────────────
    case 'saveInstallment': {
      const { id, months, discount_pct, is_active } = payload
      const { error } = await admin
        .from('installment_config')
        .update({ months, discount_pct, is_active, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // ── Setup fee (upsert) ───────────────────────────────────────────────────
    case 'saveSetupFee': {
      const { id, amount_ngn, is_required, description } = payload
      let error

      if (id) {
        ;({ error } = await admin
          .from('setup_fee_config')
          .update({ amount_ngn, is_required, description, updated_at: new Date().toISOString() })
          .eq('id', id))
      } else {
        ;({ error } = await admin
          .from('setup_fee_config')
          .insert({ amount_ngn, is_required, description }))
      }

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      // Return fresh row so the client can capture a newly-assigned id
      const { data } = await admin.from('setup_fee_config').select('*').maybeSingle()
      return NextResponse.json({ ok: true, data })
    }

    // ── Subscription plan (insert or update) ─────────────────────────────────
    case 'savePlan': {
      const plan = payload
      let error

      if (plan.id && !plan.id.startsWith('new_')) {
        ;({ error } = await admin
          .from('subscription_plans')
          .update({
            name:               plan.name,
            price_ngn:          plan.price_ngn,
            price_per_user_ngn: plan.price_per_user_ngn,
            billing_cycle:      plan.billing_cycle,
            features:           plan.features,
            student_limit:      plan.student_limit,
            is_active:          plan.is_active,
            is_popular:         plan.is_popular,
            color:              plan.color,
            sort_order:         plan.sort_order,
            updated_at:         new Date().toISOString(),
          })
          .eq('id', plan.id))
      } else {
        const slug = plan.name.toLowerCase().replace(/\s+/g, '_') + '_' + plan.price_ngn
        ;({ error } = await admin
          .from('subscription_plans')
          .insert({
            name:               plan.name,
            slug,
            price_ngn:          plan.price_ngn,
            price_per_user_ngn: plan.price_per_user_ngn,
            billing_cycle:      plan.billing_cycle,
            features:           plan.features,
            student_limit:      plan.student_limit,
            is_active:          plan.is_active,
            is_popular:         plan.is_popular,
            color:              plan.color,
            sort_order:         plan.sort_order,
          }))
      }

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // ── Delete a plan ────────────────────────────────────────────────────────
    case 'deletePlan': {
      const { id } = payload
      const { error } = await admin.from('subscription_plans').delete().eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // ── Toggle plan active/inactive ──────────────────────────────────────────
    case 'togglePlan': {
      const { id, is_active } = payload
      const { error } = await admin
        .from('subscription_plans')
        .update({ is_active })
        .eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  }
}
