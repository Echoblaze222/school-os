// src/app/api/examination/certificates/eligibility/route.ts
// -------------------------------------------------------
// §23: does NOT assume every student in a graduating class automatically
// qualifies. Checked per-student against graduation_records +
// profiles.lifecycle_stage, with a structured reason returned for
// anyone who doesn't qualify yet, so the admin UI can show exactly why.
// -------------------------------------------------------

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasExamCapability } from '@/lib/supabase/examPermissions'
import { isStudentEligibleForGraduationCertificate } from '@/lib/certificates/eligibility'

export async function POST(req: Request) {
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated.' }, { status: 401 })

  const { data: profile } = await admin.from('profiles').select('role, school_id').eq('id', user.id).single()
  const { data: appts } = await admin.from('appointments').select('appointment_type, status').eq('profile_id', user.id).eq('status', 'active')
  if (profile?.role !== 'principal' && !hasExamCapability('manage_exams', profile?.role, appts as any)) {
    return NextResponse.json({ ok: false, error: 'You do not have permission to check certificate eligibility.' }, { status: 403 })
  }

  let body: { studentIds?: string[]; graduationYear?: number }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: "Couldn't read the request body." }, { status: 400 }) }

  const studentIds = (body.studentIds ?? []).filter(Boolean)
  const graduationYear = body.graduationYear
  if (studentIds.length === 0 || !graduationYear) {
    return NextResponse.json({ ok: false, error: 'studentIds and graduationYear are required.' }, { status: 400 })
  }
  if (studentIds.length > 500) {
    return NextResponse.json({ ok: false, error: 'Check at most 500 students at a time.' }, { status: 400 })
  }

  const [{ data: students }, { data: studentProfiles }, { data: records }, { data: existingCerts }] = await Promise.all([
    admin.from('profiles').select('id, school_id').in('id', studentIds).eq('school_id', profile!.school_id),
    admin.from('student_profiles').select('id, lifecycle_stage').in('id', studentIds),
    admin.from('graduation_records').select('id, student_id, school_id, graduation_year, final_class')
      .in('student_id', studentIds).eq('graduation_year', graduationYear).eq('school_id', profile!.school_id),
    admin.from('certificates').select('id, student_id, status').in('student_id', studentIds).eq('graduation_year', graduationYear),
  ])

  const lifecycleById = new Map((studentProfiles ?? []).map(sp => [sp.id, sp.lifecycle_stage]))
  const studentById  = new Map((students ?? []).map(s => [s.id, {
    id: s.id, school_id: s.school_id, lifecycle_stage: lifecycleById.get(s.id) ?? null,
  }]))
  const recordById   = new Map((records ?? []).map(r => [r.student_id, r]))
  const certById      = new Map((existingCerts ?? []).map(c => [c.student_id, c]))

  const results = studentIds.map(id => ({
    studentId: id,
    ...isStudentEligibleForGraduationCertificate(
      studentById.get(id) ?? null,
      recordById.get(id) ?? null,
      certById.get(id) ?? null,
    ),
  }))

  return NextResponse.json({
    ok: true,
    results,
    eligibleCount: results.filter(r => r.eligible).length,
    totalCount: results.length,
  })
}
