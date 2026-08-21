// src/app/api/admission/staff/applications/route.ts
// Phase 4, Lane D - lets Secretary/Principal record a walk-in/offline
// applicant directly into the canonical admission_applications table,
// so a person who applied on paper still ends up in the same system as
// a self-service applicant (§44: no disconnected second system).
//
// A walk-in applicant has no SchoolOS session of their own at the point
// of entry, but admission_applications.applicant_profile_id is NOT NULL
// and RLS's applicant-read policy is keyed off it - so this route gives
// them a real, minimal profile (no login capability granted here; that
// stays a separate, explicit step) rather than attributing the row to
// the staff member, which would misrepresent who the applicant is.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rateLimit'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, school_id')
    .eq('id', user.id)
    .single()

  // Authorization: only staff of the school they're recording an
  // applicant for. Not derived from the request body's school_id -
  // always the caller's own school_id, so there's no way to pass a
  // different school_id and write into another tenant's data.
  if (!profile || !['secretary', 'principal'].includes(profile.role) || !profile.school_id) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const admin = createAdminClient()
  const rl = await checkRateLimit(admin, 'admission_staff_create', user.id, 60, 3600)
  if (!rl.allowed) {
    const r = rl.errorResponse!
    return NextResponse.json({ error: r.error }, { status: r.status })
  }

  const body = await req.json().catch(() => null)
  const applicantName = typeof body?.applicantName === 'string' ? body.applicantName.trim() : ''
  const applicantEmail = typeof body?.applicantEmail === 'string' ? body.applicantEmail.trim().toLowerCase() : ''
  const classApplyingFor = typeof body?.classApplyingFor === 'string' ? body.classApplyingFor.trim().slice(0, 100) : null
  const notes = typeof body?.notes === 'string' ? body.notes.trim().slice(0, 2000) : null

  if (!applicantName || applicantName.length < 2) {
    return NextResponse.json({ error: 'Applicant name is required.' }, { status: 400 })
  }
  if (applicantName.length > 200) {
    return NextResponse.json({ error: 'Applicant name is too long.' }, { status: 400 })
  }

  let applicantProfileId: string

  if (applicantEmail) {
    const { data: existing } = await admin.from('profiles').select('id').eq('email', applicantEmail).maybeSingle()
    if (existing) {
      applicantProfileId = existing.id
    } else {
      // Create a minimal, password-less identity. Staff never sets or
      // sees a password for this account - if the applicant later wants
      // to sign in and self-manage, that's a separate "claim this
      // application" flow (password reset on their own email), not
      // something staff can do on their behalf.
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: applicantEmail,
        email_confirm: false,
        user_metadata: { created_via: 'staff_walkin_application' },
      })
      if (createErr || !created?.user) {
        return NextResponse.json({ error: 'Could not create a record for this applicant.' }, { status: 500 })
      }
      const { error: profErr } = await admin.from('profiles').insert({
        id: created.user.id,
        role: 'parent',
        full_name: applicantName,
        email: applicantEmail,
        school_id: null,
        onboarding_stage: 'complete',
        is_active: true,
      })
      if (profErr) {
        await admin.auth.admin.deleteUser(created.user.id)
        return NextResponse.json({ error: 'Could not create a record for this applicant.' }, { status: 500 })
      }
      applicantProfileId = created.user.id
    }
  } else {
    // No email given at all (common for a walk-in who filled a paper
    // form without one). Still needs a real profile row for the FK -
    // generate a placeholder, clearly-marked internal email so it can
    // never collide with or be mistaken for a real applicant-supplied
    // address, and is easy to find and re-link later.
    const placeholderEmail = `walkin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@no-email.schoolos.internal`
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: placeholderEmail,
      email_confirm: false,
      user_metadata: { created_via: 'staff_walkin_application_no_email' },
    })
    if (createErr || !created?.user) {
      return NextResponse.json({ error: 'Could not create a record for this applicant.' }, { status: 500 })
    }
    const { error: profErr } = await admin.from('profiles').insert({
      id: created.user.id,
      role: 'parent',
      full_name: applicantName,
      email: placeholderEmail,
      school_id: null,
      onboarding_stage: 'complete',
      is_active: true,
    })
    if (profErr) {
      await admin.auth.admin.deleteUser(created.user.id)
      return NextResponse.json({ error: 'Could not create a record for this applicant.' }, { status: 500 })
    }
    applicantProfileId = created.user.id
  }

  const { data: application, error } = await admin
    .from('admission_applications')
    .insert({
      school_id: profile.school_id,
      applicant_profile_id: applicantProfileId,
      applicant_name: applicantName,
      applicant_email: applicantEmail || null,
      class_applying_for: classApplyingFor,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      decision_notes: notes,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.from('admission_status_events').insert({
    application_id: application.id,
    status: 'submitted',
    note: 'Recorded by school staff.',
    created_by: user.id,
  })

  try {
    await admin.from('portal_audit_log').insert({
      actor_id: user.id,
      action: 'admission_application_staff_created',
      target_table: 'admission_applications',
      target_id: application.id,
      metadata: { school_id: profile.school_id },
    })
  } catch {
    // Best-effort - audit logging must never block the actual operation.
  }

  return NextResponse.json({ application }, { status: 201 })
}
