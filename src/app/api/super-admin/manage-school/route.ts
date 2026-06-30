// app/api/super-admin/manage-school/route.ts
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// ─── Auth guard ───────────────────────────────────────────────────────────────
async function assertSuperAdmin() {
  const supabase      = await createClient()
  const adminSupabase = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: sa } = await adminSupabase
    .from('platform_admins')
    .select('id')
    .eq('id', user.id)
    .single()
  if (!sa) throw new Error('Not a super admin')
  return { adminId: user.id, adminSupabase }
}

// ─── Shared: unlock a school across both tables ───────────────────────────────
async function unlockSchool(adminSupabase: any, school_id: string, adminId: string) {
  const now = new Date().toISOString()

  await adminSupabase
    .from('schools')
    .update({ setup_status: 'active', is_platform_active: true, updated_at: now })
    .eq('id', school_id)

  await adminSupabase
    .from('subscriptions')
    .update({ status: 'Active', updated_at: now })
    .eq('school_id', school_id)
    .eq('status', 'Expired')

  await adminSupabase.from('portal_audit_log').insert({
    actor_id: adminId, action: 'unlock_school',
    target_table: 'schools', target_id: school_id,
  })
}

// ─── Shared: lock a school ────────────────────────────────────────────────────
async function lockSchool(adminSupabase: any, school_id: string, adminId: string) {
  const now = new Date().toISOString()

  await adminSupabase
    .from('schools')
    .update({ setup_status: 'locked', is_platform_active: false, updated_at: now })
    .eq('id', school_id)

  await adminSupabase.from('portal_audit_log').insert({
    actor_id: adminId, action: 'lock_school',
    target_table: 'schools', target_id: school_id,
  })
}

export async function POST(req: Request) {
  try {
    const { adminId, adminSupabase } = await assertSuperAdmin()
    const body = await req.json()
    const { action, school_id } = body

    if (!school_id) return NextResponse.json({ ok: false, error: 'school_id required' }, { status: 400 })

    // ── toggle_lock ───────────────────────────────────────────────────────────
    if (action === 'toggle_lock') {
      const { data: school, error: fetchErr } = await adminSupabase
        .from('schools')
        .select('setup_status')
        .eq('id', school_id)
        .single()

      if (fetchErr || !school) return NextResponse.json({ ok: false, error: 'School not found' }, { status: 404 })

      const isLocked = school.setup_status === 'locked'

      if (isLocked) {
        await unlockSchool(adminSupabase, school_id, adminId)
        return NextResponse.json({ ok: true, setup_status: 'active' })
      } else {
        await lockSchool(adminSupabase, school_id, adminId)
        return NextResponse.json({ ok: true, setup_status: 'locked' })
      }
    }

    // ── lock_school (explicit) ────────────────────────────────────────────────
    if (action === 'lock_school') {
      await lockSchool(adminSupabase, school_id, adminId)
      return NextResponse.json({ ok: true, setup_status: 'locked' })
    }

    // ── unlock_school (explicit) ──────────────────────────────────────────────
    if (action === 'unlock_school') {
      await unlockSchool(adminSupabase, school_id, adminId)
      return NextResponse.json({ ok: true, setup_status: 'active' })
    }

    // ── extend_trial ──────────────────────────────────────────────────────────
    if (action === 'extend_trial') {
      const days = Number(body.days ?? 5)
      if (!days || days < 1) return NextResponse.json({ ok: false, error: 'Invalid days' }, { status: 400 })

      const { data: school, error: fetchErr } = await adminSupabase
        .from('schools')
        .select('trial_ends_at')
        .eq('id', school_id)
        .single()

      if (fetchErr || !school) return NextResponse.json({ ok: false, error: 'School not found' }, { status: 404 })

      const base     = school.trial_ends_at ? new Date(school.trial_ends_at) : new Date()
      const newExpiry = new Date(base.getTime() + days * 86_400_000)

      const { error } = await adminSupabase
        .from('schools')
        .update({
          trial_ends_at:      newExpiry.toISOString(),
          trial_extended:     true,
          setup_status:       'trial',
          is_platform_active: true,
          updated_at:         new Date().toISOString(),
        })
        .eq('id', school_id)

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      await adminSupabase.from('portal_audit_log').insert({
        actor_id: adminId, action: 'extend_trial', target_table: 'schools', target_id: school_id,
        metadata: { days, new_expiry: newExpiry.toISOString() },
      })
      return NextResponse.json({ ok: true })
    }

    // ── confirm_setup ─────────────────────────────────────────────────────────
    if (action === 'confirm_setup') {
      const amount_ngn  = Number(body.amount_ngn ?? 0)
      const payment_ref = body.payment_ref as string | undefined
      const now         = new Date()
      const freeEnd     = new Date(now.getTime() + 30 * 86_400_000)

      const { error } = await adminSupabase
        .from('schools')
        .update({
          setup_status:        'active',
          is_platform_active:  true,
          setup_paid_at:       now.toISOString(),
          subscription_plan:   'free_month',
          free_month_starts:   now.toISOString(),
          free_month_ends:     freeEnd.toISOString(),
          subscription_starts: now.toISOString(),
          subscription_ends:   freeEnd.toISOString(),
          next_payment_due:    freeEnd.toISOString(),
          updated_at:          now.toISOString(),
        })
        .eq('id', school_id)

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

      await adminSupabase.from('subscriptions').upsert({
        school_id,
        plan_type:     'free_month',
        status:        'Active',
        billing_cycle: 'Monthly',
        started_at:    now.toISOString().split('T')[0],
        expiry_date:   freeEnd.toISOString().split('T')[0],
        amount_paid:   amount_ngn,
        currency_used: 'NGN',
        payment_reference: payment_ref ?? null,
      }, { onConflict: 'school_id' })

      if (amount_ngn > 0) {
        await adminSupabase.from('school_payments').insert({
          school_id, payment_type: 'setup', amount_ngn,
          payment_ref: payment_ref ?? null,
          confirmed_by: adminId, confirmed_at: now.toISOString(),
        })
      }

      await adminSupabase.from('portal_audit_log').insert({
        actor_id: adminId, action: 'confirm_setup', target_table: 'schools', target_id: school_id,
        metadata: { amount_ngn, payment_ref },
      })
      return NextResponse.json({ ok: true })
    }

    // ── confirm_subscription ──────────────────────────────────────────────────
    if (action === 'confirm_subscription') {
      const plan        = (body.plan as string) ?? 'basic_500'
      const amount_ngn  = Number(body.amount_ngn ?? 0)
      const payment_ref = body.payment_ref as string | undefined
      const now         = new Date()

      const cycleMonths: Record<string, number> = {
        basic_500: 1, standard_1000: 1, premium_2000: 1, installment_3month: 3,
      }
      const months = cycleMonths[plan] ?? 1
      const subEnd = new Date(now.getTime() + months * 30 * 86_400_000)

      const { error } = await adminSupabase
        .from('schools')
        .update({
          setup_status:        'active',
          is_platform_active:  true,
          subscription_plan:   plan,
          subscription_starts: now.toISOString(),
          subscription_ends:   subEnd.toISOString(),
          next_payment_due:    subEnd.toISOString(),
          updated_at:          now.toISOString(),
        })
        .eq('id', school_id)

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

      await adminSupabase.from('subscriptions').upsert({
        school_id,
        plan_type:         plan,
        status:            'Active',
        billing_cycle:     'Termly',
        started_at:        now.toISOString().split('T')[0],
        expiry_date:       subEnd.toISOString().split('T')[0],
        amount_paid:       amount_ngn,
        currency_used:     'NGN',
        payment_reference: payment_ref ?? null,
      }, { onConflict: 'school_id' })

      if (amount_ngn > 0) {
        await adminSupabase.from('school_payments').insert({
          school_id, payment_type: 'subscription', plan, amount_ngn,
          payment_ref: payment_ref ?? null,
          confirmed_by: adminId, confirmed_at: now.toISOString(),
        })
      }

      await adminSupabase.from('portal_audit_log').insert({
        actor_id: adminId, action: 'confirm_subscription', target_table: 'schools', target_id: school_id,
        metadata: { plan, amount_ngn, payment_ref },
      })
      return NextResponse.json({ ok: true })
    }

    // ── save_notes ────────────────────────────────────────────────────────────
    if (action === 'save_notes') {
      const { error } = await adminSupabase
        .from('schools')
        .update({ notes: body.notes ?? '', updated_at: new Date().toISOString() })
        .eq('id', school_id)

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // ── save_compliance ──────────────────────────────────────────────────────
    // Updates (or creates, via upsert) the school's compliance contact + bank
    // snapshot. Does NOT mark it verified — that's a separate explicit action
    // (verify_compliance) so editing details doesn't silently re-approve a
    // record that should be re-reviewed.
    if (action === 'save_compliance') {
      const {
        contact_name, contact_role, contact_phone, contact_email,
        verified_bank_name, verified_account_number, verified_account_name,
        verification_notes,
      } = body

      const { error } = await adminSupabase
        .from('school_compliance_records')
        .upsert({
          school_id,
          contact_name:            contact_name ?? null,
          contact_role:            contact_role ?? null,
          contact_phone:           contact_phone ?? null,
          contact_email:           contact_email ?? null,
          verified_bank_name:      verified_bank_name ?? null,
          verified_account_number: verified_account_number ?? null,
          verified_account_name:   verified_account_name ?? null,
          verification_notes:      verification_notes ?? null,
          updated_at:               new Date().toISOString(),
        }, { onConflict: 'school_id' })

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

      await adminSupabase.from('portal_audit_log').insert({
        actor_id: adminId, action: 'save_compliance',
        target_table: 'school_compliance_records', target_id: school_id,
      })
      return NextResponse.json({ ok: true })
    }

    // ── verify_compliance ────────────────────────────────────────────────────
    // Explicit due-diligence sign-off. This is the gate checked by
    // /api/paystack/create-subaccount before a school is allowed to connect
    // Paystack — Alfa's compliance team specifically asked that schools be
    // verified before going live with split payments.
    if (action === 'verify_compliance') {
      const { data: record } = await adminSupabase
        .from('school_compliance_records')
        .select('contact_name, contact_phone, verified_bank_name, verified_account_number')
        .eq('school_id', school_id)
        .maybeSingle()

      if (!record?.contact_name || !record?.contact_phone) {
        return NextResponse.json(
          { ok: false, error: 'Add a contact name and phone number before verifying.' },
          { status: 400 }
        )
      }

      const { error } = await adminSupabase
        .from('school_compliance_records')
        .update({
          is_verified: true,
          verified_by: adminId,
          verified_at: new Date().toISOString(),
        })
        .eq('school_id', school_id)

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

      await adminSupabase.from('portal_audit_log').insert({
        actor_id: adminId, action: 'verify_compliance',
        target_table: 'school_compliance_records', target_id: school_id,
      })
      return NextResponse.json({ ok: true })
    }

    // ── unverify_compliance ──────────────────────────────────────────────────
    if (action === 'unverify_compliance') {
      const { error } = await adminSupabase
        .from('school_compliance_records')
        .update({ is_verified: false, verified_by: null, verified_at: null })
        .eq('school_id', school_id)

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

      await adminSupabase.from('portal_audit_log').insert({
        actor_id: adminId, action: 'unverify_compliance',
        target_table: 'school_compliance_records', target_id: school_id,
      })
      return NextResponse.json({ ok: true })
    }

    // ── delete_school ─────────────────────────────────────────────────────────
    if (action === 'delete_school') {
      const { data: profiles } = await adminSupabase
        .from('profiles').select('id').eq('school_id', school_id)

      const { error } = await adminSupabase
        .from('schools').delete().eq('id', school_id)

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

      if (profiles?.length) {
        for (const p of profiles) {
          try { await adminSupabase.auth.admin.deleteUser(p.id) } catch { /* ignore */ }
        }
      }

      await adminSupabase.from('portal_audit_log').insert({
        actor_id: adminId, action: 'delete_school', target_table: 'schools', target_id: school_id,
        metadata: { deleted_user_count: profiles?.length ?? 0 },
      })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
        }
    
