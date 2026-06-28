// app/api/super-admin/manage-school/route.ts
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// ─── Auth guard: must be an authenticated platform_admin ─────────────────────
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

export async function POST(req: Request) {
  try {
    const { adminId, adminSupabase } = await assertSuperAdmin()
    const body = await req.json()
    const { action, school_id } = body

    if (!school_id) return NextResponse.json({ ok: false, error: 'school_id required' }, { status: 400 })

    // ── toggle_lock ────────────────────────────────────────────────────────────
    if (action === 'toggle_lock') {
      // Get current status
      const { data: school, error: fetchErr } = await adminSupabase
        .from('schools')
        .select('setup_status')
        .eq('id', school_id)
        .single()

      if (fetchErr || !school) return NextResponse.json({ ok: false, error: 'School not found' }, { status: 404 })

      const isLocked      = school.setup_status === 'locked'
      const next_status   = isLocked ? 'expired' : 'locked'
      const is_platform_active = isLocked  // unlock = true, lock = false

      const { error } = await adminSupabase
        .from('schools')
        .update({
          setup_status:       next_status,
          is_platform_active: is_platform_active,
          updated_at:         new Date().toISOString(),
        })
        .eq('id', school_id)

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

      // Log audit
      await adminSupabase.from('portal_audit_log').insert({
        actor_id:     adminId,
        action:       isLocked ? 'unlock_school' : 'lock_school',
        target_table: 'schools',
        target_id:    school_id,
        metadata:     { previous_status: school.setup_status, new_status: next_status },
      })

      return NextResponse.json({ ok: true, setup_status: next_status })
    }

    // ── lock_school (explicit) ─────────────────────────────────────────────────
    if (action === 'lock_school') {
      const { error } = await adminSupabase
        .from('schools')
        .update({ setup_status: 'locked', is_platform_active: false, updated_at: new Date().toISOString() })
        .eq('id', school_id)

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      await adminSupabase.from('portal_audit_log').insert({
        actor_id: adminId, action: 'lock_school', target_table: 'schools', target_id: school_id,
      })
      return NextResponse.json({ ok: true, setup_status: 'locked' })
    }

    // ── unlock_school (explicit) ───────────────────────────────────────────────
    if (action === 'unlock_school') {
      const { error } = await adminSupabase
        .from('schools')
        .update({ setup_status: 'active', is_platform_active: true, updated_at: new Date().toISOString() })
        .eq('id', school_id)

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      await adminSupabase.from('portal_audit_log').insert({
        actor_id: adminId, action: 'unlock_school', target_table: 'schools', target_id: school_id,
      })
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

      const base         = school.trial_ends_at ? new Date(school.trial_ends_at) : new Date()
      const newExpiry    = new Date(base.getTime() + days * 86_400_000)

      const { error } = await adminSupabase
        .from('schools')
        .update({
          trial_ends_at:    newExpiry.toISOString(),
          trial_extended:   true,
          setup_status:     'trial',
          is_platform_active: true,
          updated_at:       new Date().toISOString(),
        })
        .eq('id', school_id)

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      await adminSupabase.from('portal_audit_log').insert({
        actor_id: adminId, action: 'extend_trial', target_table: 'schools', target_id: school_id,
        metadata: { days, new_expiry: newExpiry.toISOString() },
      })
      return NextResponse.json({ ok: true })
    }

    // ── confirm_setup (trial → 1 month free active) ────────────────────────────
    if (action === 'confirm_setup') {
      const amount_ngn  = Number(body.amount_ngn  ?? 0)
      const payment_ref = body.payment_ref as string | undefined
      const now         = new Date()
      const freeEnd     = new Date(now.getTime() + 30 * 86_400_000)

      const { error } = await adminSupabase
        .from('schools')
        .update({
          setup_status:       'active',
          is_platform_active: true,
          setup_paid_at:      now.toISOString(),
          subscription_plan:  'free_month',
          free_month_starts:  now.toISOString(),
          free_month_ends:    freeEnd.toISOString(),
          subscription_starts: now.toISOString(),
          subscription_ends:  freeEnd.toISOString(),
          next_payment_due:   freeEnd.toISOString(),
          updated_at:         now.toISOString(),
        })
        .eq('id', school_id)

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

      // Record payment
      if (amount_ngn > 0) {
        await adminSupabase.from('school_payments').insert({
          school_id,
          payment_type: 'setup',
          amount_ngn,
          payment_ref:  payment_ref ?? null,
          confirmed_by: adminId,
          confirmed_at: now.toISOString(),
        })
      }

      await adminSupabase.from('portal_audit_log').insert({
        actor_id: adminId, action: 'confirm_setup', target_table: 'schools', target_id: school_id,
        metadata: { amount_ngn, payment_ref },
      })
      return NextResponse.json({ ok: true })
    }

    // ── confirm_subscription (free month → paid plan) ─────────────────────────
    if (action === 'confirm_subscription') {
      const plan       = (body.plan as string) ?? 'basic_500'
      const amount_ngn = Number(body.amount_ngn ?? 0)
      const payment_ref = body.payment_ref as string | undefined
      const now        = new Date()

      // Determine billing period from plan slug
      const cycleMonths: Record<string, number> = {
        basic_500: 1, standard_1000: 1, premium_2000: 1, installment_3month: 3,
      }
      const months  = cycleMonths[plan] ?? 1
      const subEnd  = new Date(now.getTime() + months * 30 * 86_400_000)

      const { error } = await adminSupabase
        .from('schools')
        .update({
          setup_status:       'active',
          is_platform_active: true,
          subscription_plan:  plan,
          subscription_starts: now.toISOString(),
          subscription_ends:  subEnd.toISOString(),
          next_payment_due:   subEnd.toISOString(),
          updated_at:         now.toISOString(),
        })
        .eq('id', school_id)

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

      if (amount_ngn > 0) {
        await adminSupabase.from('school_payments').insert({
          school_id,
          payment_type: 'subscription',
          plan,
          amount_ngn,
          payment_ref:  payment_ref ?? null,
          confirmed_by: adminId,
          confirmed_at: now.toISOString(),
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

    // ── delete_school ─────────────────────────────────────────────────────────
    if (action === 'delete_school') {
      // Get all user IDs for this school first so we can delete auth accounts
      const { data: profiles } = await adminSupabase
        .from('profiles')
        .select('id')
        .eq('school_id', school_id)

      // Delete the school row (cascades via FK to classes, profiles, etc.)
      const { error } = await adminSupabase
        .from('schools')
        .delete()
        .eq('id', school_id)

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

      // Delete auth users for this school
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
