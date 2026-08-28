// src/app/api/nurse/health-records/route.ts
//
// student_medical_records already existed in the live database (see
// clinic_visits comment in ../visits/route.ts for the full story) -
// this route was rewritten to match it: table name differs
// (student_health_profiles -> student_medical_records), and
// allergies/chronic_conditions/current_medications are plain text
// columns there, not text[] arrays - stored here as a comma-joined
// string, same UI (comma-separated input) either way.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasActiveAppointment } from '@/lib/permissions'

async function requireNurse() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('id, school_id').eq('id', user.id).single()
  if (!profile?.school_id) return null
  const isNurse = await hasActiveAppointment(supabase, user.id, profile.school_id, 'nurse')
  if (!isNurse) return null
  return { userId: user.id, schoolId: profile.school_id }
}

export async function GET(request: Request) {
  const caller = await requireNurse()
  if (!caller) return NextResponse.json({ ok: false, error: 'Not authorized.' }, { status: 403 })

  const url = new URL(request.url)
  const search = url.searchParams.get('search')?.trim()

  const admin = createAdminClient()

  let studentsQuery = admin
    .from('profiles')
    .select('id, full_name, avatar_url, class_id')
    .eq('school_id', caller.schoolId)
    .eq('role', 'student')
    .order('full_name')
    .limit(200)

  if (search) studentsQuery = studentsQuery.ilike('full_name', `%${search}%`)

  const { data: students, error: studentsError } = await studentsQuery
  if (studentsError) return NextResponse.json({ ok: false, error: studentsError.message }, { status: 500 })

  const studentIds = (students ?? []).map(s => s.id)
  const { data: records } = studentIds.length > 0
    ? await admin.from('student_medical_records').select('*').eq('school_id', caller.schoolId).in('student_id', studentIds)
    : { data: [] }

  const recordByStudent = new Map((records ?? []).map((r: any) => [r.student_id, r]))
  const results = (students ?? []).map(s => ({
    student: s,
    healthProfile: recordByStudent.get(s.id) ?? null,
  }))

  return NextResponse.json({ ok: true, records: results })
}

export async function POST(request: Request) {
  const caller = await requireNurse()
  if (!caller) return NextResponse.json({ ok: false, error: 'Not authorized.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (!body?.studentId) return NextResponse.json({ ok: false, error: 'studentId is required.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: student } = await admin.from('profiles').select('id').eq('id', body.studentId).eq('school_id', caller.schoolId).eq('role', 'student').single()
  if (!student) return NextResponse.json({ ok: false, error: 'Student not found at your school.' }, { status: 400 })

  const toText = (v: unknown) => Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).join(', ') : (v ? String(v).trim() : null)

  const payload = {
    school_id: caller.schoolId,
    student_id: body.studentId,
    blood_group: body.bloodGroup ? String(body.bloodGroup).trim() : null,
    allergies: toText(body.allergies),
    chronic_conditions: toText(body.chronicConditions),
    current_medications: toText(body.currentMedications),
    emergency_contact_name: body.emergencyContactName ? String(body.emergencyContactName).trim() : null,
    emergency_contact_phone: body.emergencyContactPhone ? String(body.emergencyContactPhone).trim() : null,
    emergency_contact_relationship: body.emergencyContactRelationship ? String(body.emergencyContactRelationship).trim() : null,
    physician_name: body.physicianName ? String(body.physicianName).trim() : null,
    physician_phone: body.physicianPhone ? String(body.physicianPhone).trim() : null,
    notes: body.notes ? String(body.notes).trim() : null,
    updated_by: caller.userId,
    updated_at: new Date().toISOString(),
  }

  const { data: record, error } = await admin
    .from('student_medical_records')
    .upsert(payload, { onConflict: 'student_id' })
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, record })
}
