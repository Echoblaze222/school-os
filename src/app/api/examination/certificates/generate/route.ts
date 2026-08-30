// src/app/api/examination/certificates/generate/route.ts
// -------------------------------------------------------
// Bulk-creates certificate rows for eligible students (§37). This only
// moves students into DRAFT/PENDING_APPROVAL — it does NOT allocate a
// certificate number, render a PDF, or generate a QR code. Those only
// happen at issuance (see [id]/approve/route.ts), because the numbering
// rule (§30) must never hand out a number that's later thrown away.
//
// Eligibility is re-checked here server-side even if the admin UI
// already ran /eligibility — never trust a client-supplied "eligible: true".
// -------------------------------------------------------

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasExamCapability } from '@/lib/supabase/examPermissions'
import { checkRateLimit } from '@/lib/rateLimit'
import { isStudentEligibleForGraduationCertificate } from '@/lib/certificates/eligibility'
import { randomUUID } from 'crypto'

export async function POST(req: Request) {
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated.' }, { status: 401 })

  const { data: profile } = await admin.from('profiles').select('role, school_id').eq('id', user.id).single()
  const { data: appts } = await admin.from('appointments').select('appointment_type, status').eq('profile_id', user.id).eq('status', 'active')
  const isPrincipal = profile?.role === 'principal'
  if (!isPrincipal && !hasExamCapability('manage_exams', profile?.role, appts as any)) {
    return NextResponse.json({ ok: false, error: 'You do not have permission to generate certificates.' }, { status: 403 })
  }
  if (!profile?.school_id) return NextResponse.json({ ok: false, error: 'No school linked to this account.' }, { status: 400 })

  const rl = await checkRateLimit(admin, 'certificate_generate', user.id, 20, 3600)
  if (!rl.allowed) return NextResponse.json({ ok: false, error: rl.errorResponse!.error }, { status: rl.errorResponse!.status })

  let body: { studentIds?: string[]; graduationYear?: number; templateId?: string | null }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: "Couldn't read the request body." }, { status: 400 }) }

  const studentIds = (body.studentIds ?? []).filter(Boolean)
  const graduationYear = body.graduationYear
  if (studentIds.length === 0 || !graduationYear) {
    return NextResponse.json({ ok: false, error: 'studentIds and graduationYear are required.' }, { status: 400 })
  }
  if (studentIds.length > 500) {
    return NextResponse.json({ ok: false, error: 'Generate at most 500 certificates at a time. Split into batches.' }, { status: 400 })
  }

  const [{ data: students }, { data: studentProfiles }, { data: records }, { data: existingCerts }] = await Promise.all([
    admin.from('profiles').select('id, school_id').in('id', studentIds).eq('school_id', profile.school_id),
    admin.from('student_profiles').select('id, lifecycle_stage').in('id', studentIds),
    admin.from('graduation_records').select('id, student_id, school_id, graduation_year, final_class')
      .in('student_id', studentIds).eq('graduation_year', graduationYear).eq('school_id', profile.school_id),
    admin.from('certificates').select('id, student_id, status').in('student_id', studentIds).eq('graduation_year', graduationYear),
  ])

  const lifecycleById = new Map((studentProfiles ?? []).map(sp => [sp.id, sp.lifecycle_stage]))
  const studentById = new Map((students ?? []).map(s => [s.id, {
    id: s.id, school_id: s.school_id, lifecycle_stage: lifecycleById.get(s.id) ?? null,
  }]))
  const recordById  = new Map((records ?? []).map(r => [r.student_id, r]))
  const certById    = new Map((existingCerts ?? []).map(c => [c.student_id, c]))

  const toCreate: any[] = []
  const skipped: { studentId: string; reasons: string[] }[] = []

  for (const studentId of studentIds) {
    const check = isStudentEligibleForGraduationCertificate(
      studentById.get(studentId) ?? null, recordById.get(studentId) ?? null, certById.get(studentId) ?? null,
    )
    if (!check.eligible) { skipped.push({ studentId, reasons: check.reasons }); continue }
    const record = recordById.get(studentId)!
    toCreate.push({
      // Placeholder, distinct in shape from the real PREFIX/YEAR/###### format
      // allocated at approval — satisfies NOT NULL UNIQUE without
      // consuming a real sequence number for a draft that might be discarded.
      certificate_number: `DRAFT-${randomUUID()}`,
      public_token: randomUUID().replace(/-/g, ''),
      school_id: profile.school_id,
      student_id: studentId,
      template_id: body.templateId ?? null,
      graduation_year: graduationYear,
      final_class: record.final_class,
      status: isPrincipal ? 'pending_approval' : 'draft', // exam officers stage drafts; principal still approves before issuance
      created_by: user.id,
    })
  }

  if (toCreate.length === 0) {
    return NextResponse.json({ ok: true, createdCount: 0, skipped, message: 'No eligible students to generate certificates for.' })
  }

  const { data: created, error } = await admin.from('certificates').insert(toCreate).select('id, student_id, status')
  if (error) {
    return NextResponse.json({ ok: false, error: `Certificate generation failed: ${error.message}` }, { status: 500 })
  }

  await admin.from('certificate_audit_events').insert(
    (created ?? []).map(c => ({ certificate_id: c.id, event_type: 'created', actor_id: user.id, metadata: { status: c.status } })),
  ).then(() => {}, () => {})

  return NextResponse.json({ ok: true, createdCount: created?.length ?? 0, skipped })
}
