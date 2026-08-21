// src/app/api/admission/applications/route.ts
// Public platform (Phase 4, Lane C) - §41-43 admission request workflow.
//
// SECURITY NOTE: every query here runs through the session-scoped
// (cookie-based) Supabase client, never the admin/service-role client.
// That means Postgres RLS (see sql/admission-system-schema.sql) is the
// actual enforcement boundary for "an applicant only sees their own
// applications" and "a school only sees its own applications" - this
// route's job is request validation and business rules on top of that,
// not re-implementing authorization. Using the admin client here would
// silently bypass RLS and turn a single bug in this file into a
// cross-tenant data leak.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rateLimit'

const MAX_NOTE_LEN = 5000

// GET - the current user's own applications if they're an applicant,
// or their school's applications if they're staff. No branching logic
// needed here: RLS evaluates the applicant-read and staff-read policies
// with OR semantics, so a single unfiltered select naturally returns
// the right rows for whichever kind of caller this is.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('admission_applications')
    .select(`
      id, school_id, applicant_name, applicant_email, applicant_phone,
      class_applying_for, status, submitted_at, interview_at, assessment_at,
      decision_notes, created_at, updated_at, migrated_from,
      schools:school_id ( name, logo_url, primary_color )
    `)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ applications: data })
}

// POST - start a new draft application, or submit an existing draft
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Applying is exactly the kind of unauthenticated-adjacent, low-friction
  // action a bot can hammer to spam a school's admission queue. Throttle
  // per-user regardless of the auth requirement above. The rate-limit
  // table has no RLS (by design - see hotfix-01-rate-limit-schema.sql),
  // so this check runs through the admin client like every other caller
  // of checkRateLimit; the actual data operations below stay on the
  // session client so RLS still governs them.
  const rl = await checkRateLimit(createAdminClient(), 'admission_apply_user', user.id, 10, 3600)
  if (!rl.allowed) {
    const r = rl.errorResponse!
    return NextResponse.json({ error: r.error }, { status: r.status })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })

  const { schoolId, applicantName, applicantEmail, applicantPhone, classApplyingFor, formResponses } = body

  if (!schoolId || typeof schoolId !== 'string') {
    return NextResponse.json({ error: 'A school must be specified.' }, { status: 400 })
  }
  if (!applicantName || typeof applicantName !== 'string' || applicantName.trim().length < 2) {
    return NextResponse.json({ error: 'Applicant name is required.' }, { status: 400 })
  }
  if (applicantName.length > 200) {
    return NextResponse.json({ error: 'Applicant name is too long.' }, { status: 400 })
  }

  // The school must have explicitly enabled applications (§41). RLS
  // already hides disabled schools' settings from the public read, but
  // check explicitly here too so the error message is meaningful instead
  // of a confusing generic insert failure.
  const { data: settings } = await supabase
    .from('admission_settings')
    .select('is_enabled, application_deadline')
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!settings || !settings.is_enabled) {
    return NextResponse.json({ error: 'This school is not currently accepting applications.' }, { status: 403 })
  }
  if (settings.application_deadline && new Date(settings.application_deadline) < new Date()) {
    return NextResponse.json({ error: 'The application deadline for this school has passed.' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('admission_applications')
    .insert({
      school_id: schoolId,
      applicant_profile_id: user.id,
      applicant_name: applicantName.trim(),
      applicant_email: typeof applicantEmail === 'string' ? applicantEmail.trim().slice(0, 200) : null,
      applicant_phone: typeof applicantPhone === 'string' ? applicantPhone.trim().slice(0, 30) : null,
      class_applying_for: typeof classApplyingFor === 'string' ? classApplyingFor.trim().slice(0, 100) : null,
      form_responses: typeof formResponses === 'object' && formResponses !== null ? formResponses : {},
      status: 'draft',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ application: data }, { status: 201 })
}

// PATCH - update a draft, or submit it (draft -> submitted); OR, for
// school staff, review an application (status transitions, scheduling,
// decision notes). Two distinct branches below because the rules are
// genuinely different: an applicant can only ever touch their own
// draft; staff can only ever touch submitted+ applications at their own
// school, never a draft the applicant hasn't chosen to submit yet.
export async function PATCH(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.id || typeof body.id !== 'string') {
    return NextResponse.json({ error: 'Application id is required.' }, { status: 400 })
  }

  const { data: existing, error: fetchErr } = await supabase
    .from('admission_applications')
    .select('id, status, school_id, applicant_profile_id')
    .eq('id', body.id)
    .maybeSingle()

  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Application not found.' }, { status: 404 })
  }

  const isOwner = existing.applicant_profile_id === user.id

  if (!isOwner) {
    // Must be staff of this exact application's school. RLS backs this
    // up (admission_applications_staff_update), but we check explicitly
    // here to return a clear, correct error instead of a confusing
    // silent no-op update.
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, school_id')
      .eq('id', user.id)
      .single()

    const isStaffHere = profile
      && ['secretary', 'principal'].includes(profile.role)
      && profile.school_id === existing.school_id

    if (!isStaffHere) {
      return NextResponse.json({ error: 'Not authorized for this application.' }, { status: 403 })
    }
    if (existing.status === 'draft') {
      return NextResponse.json({ error: 'This application has not been submitted yet.' }, { status: 409 })
    }

    const VALID_STAFF_STATUSES = new Set([
      'under_review', 'more_info_required', 'shortlisted', 'interview_scheduled',
      'assessment_scheduled', 'accepted', 'rejected',
    ])
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    let newStatus: string | undefined

    if (body.status !== undefined) {
      if (!VALID_STAFF_STATUSES.has(body.status)) {
        return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })
      }
      newStatus = body.status
      update.status = body.status
      update.reviewed_by = user.id
      update.reviewed_at = new Date().toISOString()
    }
    if (typeof body.decisionNotes === 'string') update.decision_notes = body.decisionNotes.trim().slice(0, MAX_NOTE_LEN)
    if (typeof body.interviewAt === 'string') update.interview_at = body.interviewAt
    if (typeof body.assessmentAt === 'string') update.assessment_at = body.assessmentAt

    const { data, error } = await supabase
      .from('admission_applications')
      .update(update)
      .eq('id', existing.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (newStatus) {
      // Same reasoning as the applicant-submit branch above: no session
      // client can insert here by design, so this authoritative write
      // goes through the admin client after this route has already
      // verified the caller is genuinely staff of this application's
      // school.
      await createAdminClient().from('admission_status_events').insert({
        application_id: existing.id,
        status: newStatus,
        note: typeof body.statusNote === 'string' ? body.statusNote.trim().slice(0, 1000) : null,
        created_by: user.id,
      })
    }

    return NextResponse.json({ application: data })
  }

  // Applicant branch (unchanged behavior).
  if (existing.status !== 'draft') {
    return NextResponse.json({ error: 'This application has already been submitted and can no longer be edited.' }, { status: 409 })
  }

  const isSubmit = body.action === 'submit'
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (typeof body.applicantName === 'string') update.applicant_name = body.applicantName.trim().slice(0, 200)
  if (typeof body.applicantEmail === 'string') update.applicant_email = body.applicantEmail.trim().slice(0, 200)
  if (typeof body.applicantPhone === 'string') update.applicant_phone = body.applicantPhone.trim().slice(0, 30)
  if (typeof body.classApplyingFor === 'string') update.class_applying_for = body.classApplyingFor.trim().slice(0, 100)
  if (typeof body.formResponses === 'object' && body.formResponses !== null) update.form_responses = body.formResponses

  if (isSubmit) {
    // Required-document check (§42/53): a school's configured required
    // documents must actually be present before we let submission
    // through, otherwise "required" is purely decorative.
    const { data: settings } = await supabase
      .from('admission_settings')
      .select('required_documents')
      .eq('school_id', existing.school_id)
      .maybeSingle()

    const required: Array<{ key: string; required?: boolean }> = settings?.required_documents ?? []
    const requiredKeys = required.filter(d => d.required).map(d => d.key)

    if (requiredKeys.length > 0) {
      const { data: docs } = await supabase
        .from('admission_documents')
        .select('document_key')
        .eq('application_id', existing.id)

      const uploadedKeys = new Set((docs ?? []).map(d => d.document_key))
      const missing = requiredKeys.filter(k => !uploadedKeys.has(k))
      if (missing.length > 0) {
        return NextResponse.json(
          { error: `Please upload the required documents before submitting: ${missing.join(', ')}` },
          { status: 400 }
        )
      }
    }

    update.status = 'submitted'
    update.submitted_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('admission_applications')
    .update(update)
    .eq('id', existing.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (isSubmit) {
    // No RLS insert policy exists on admission_status_events for the
    // session client by design (an applicant must never be able to
    // insert an arbitrary status event describing a fake decision).
    // This route has already validated that a legitimate draft->submit
    // transition just happened, so it writes the resulting event via
    // the admin client rather than exposing a broader insert policy
    // that a direct client call could otherwise abuse.
    await createAdminClient().from('admission_status_events').insert({
      application_id: existing.id,
      status: 'submitted',
      note: 'Application submitted.',
      created_by: user.id,
    })
  }

  return NextResponse.json({ application: data })
}
