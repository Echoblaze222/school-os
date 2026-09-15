// app/api/super-admin/manage-school/route.ts
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  lockSchool, unlockSchool, toggleSchoolLock,
  extendSchoolTrial, confirmSchoolSetupPayment, confirmSchoolSubscriptionPayment,
} from '@/lib/super-admin/schoolActions'

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

export async function POST(req: Request) {
  try {
    const { adminId, adminSupabase } = await assertSuperAdmin()
    const body = await req.json()
    const { action, school_id } = body

    if (!school_id) return NextResponse.json({ ok: false, error: 'school_id required' }, { status: 400 })

    // ── toggle_lock ───────────────────────────────────────────────────────────
    if (action === 'toggle_lock') {
      const result = await toggleSchoolLock(adminSupabase, school_id, adminId)
      if (!result.ok) return NextResponse.json(result, { status: result.error === 'School not found' ? 404 : 500 })
      return NextResponse.json(result)
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
      const result = await extendSchoolTrial(adminSupabase, school_id, days, adminId)
      if (!result.ok) return NextResponse.json(result, { status: result.error === 'School not found' ? 404 : 400 })
      return NextResponse.json(result)
    }

    // ── confirm_setup ─────────────────────────────────────────────────────────
    if (action === 'confirm_setup') {
      const amount_ngn  = Number(body.amount_ngn ?? 0)
      const payment_ref = body.payment_ref as string | undefined
      const result = await confirmSchoolSetupPayment(adminSupabase, school_id, amount_ngn, payment_ref, adminId)
      if (!result.ok) return NextResponse.json(result, { status: result.error === 'School not found' ? 404 : 500 })
      return NextResponse.json(result)
    }

    // ── confirm_subscription ──────────────────────────────────────────────────
    if (action === 'confirm_subscription') {
      const plan        = (body.plan as string) ?? 'basic_500'
      const amount_ngn  = Number(body.amount_ngn ?? 0)
      const payment_ref = body.payment_ref as string | undefined
      const result = await confirmSchoolSubscriptionPayment(adminSupabase, school_id, plan, amount_ngn, payment_ref, adminId)
      if (!result.ok) return NextResponse.json(result, { status: result.error === 'School not found' ? 404 : 500 })
      return NextResponse.json(result)
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
    // snapshot. Does NOT mark it verified: that's a separate explicit action
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
    // Paystack: Alfa's compliance team specifically asked that schools be
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

    // ── set_verified_status ──────────────────────────────────────────────────
    // Public-profile "Verified" badge (Lane B, S45): distinct from
    // compliance verification above, which gates Paystack split payments.
    // This one only controls what a parent sees on the school's public
    // profile page. schools.verified_status is protected from principal
    // self-editing at the database level (see
    // prevent_school_protected_field_update trigger); this route, running
    // with the service-role client, is the intended way to change it.
    if (action === 'set_verified_status') {
      const { verified_status } = body
      if (!['unverified', 'pending', 'verified'].includes(verified_status)) {
        return NextResponse.json({ ok: false, error: 'Invalid verified_status value.' }, { status: 400 })
      }

      const { error } = await adminSupabase
        .from('schools')
        .update({ verified_status, updated_at: new Date().toISOString() })
        .eq('id', school_id)

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

      await adminSupabase.from('portal_audit_log').insert({
        actor_id: adminId, action: 'set_verified_status',
        target_table: 'schools', target_id: school_id,
        metadata: { verified_status },
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
    
